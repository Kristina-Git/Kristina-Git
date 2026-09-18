import { AuditLog, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { sha256, stableStringify } from "../utils/hash";
import { Role } from "../types";

export const GENESIS_HASH = "0".repeat(64);

/** A Prisma client or an active transaction client — audit entries are always written
 * inside the same transaction as the business change they describe, so a crash can never
 * leave a mutation un-audited. */
type Db = Prisma.TransactionClient | typeof prisma;

export interface AppendAuditEntryInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string | null;
  actorRole?: Role | null;
  ipAddress?: string | null;
  before?: unknown;
  after?: unknown;
}

/**
 * Appends one immutable, hash-chained row to the audit log.
 *
 * Every row's `hash` commits to (prevHash + this row's own content hash), so altering or
 * deleting any historical row breaks the chain from that point forward and is detectable by
 * verifyChain(). Rows are never updated or deleted by application code.
 */
export async function appendAuditEntry(db: Db, input: AppendAuditEntryInput): Promise<AuditLog> {
  const last = await db.auditLog.findFirst({ orderBy: { sequence: "desc" } });
  const prevHash = last?.hash ?? GENESIS_HASH;

  const beforeState = input.before === undefined ? null : stableStringify(input.before);
  const afterState = input.after === undefined ? null : stableStringify(input.after);
  const timestamp = new Date();

  const dataHash = sha256(
    stableStringify({
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      ipAddress: input.ipAddress ?? null,
      beforeState,
      afterState,
      timestamp: timestamp.toISOString(),
    })
  );
  const hash = sha256(prevHash + dataHash);

  return db.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      ipAddress: input.ipAddress ?? null,
      beforeState,
      afterState,
      timestamp,
      dataHash,
      prevHash,
      hash,
    },
  });
}

export interface ChainVerificationResult {
  valid: boolean;
  totalEntries: number;
  brokenAtSequence: number | null;
  reason: string | null;
}

/** Recomputes the full hash chain from genesis and confirms every row is untampered and
 * correctly linked. Used by GET /audit/verify — the mechanism a CIMA examiner (or internal
 * compliance officer) can use to confirm the order/audit records have not been altered. */
export async function verifyChain(): Promise<ChainVerificationResult> {
  const entries = await prisma.auditLog.findMany({ orderBy: { sequence: "asc" } });

  let expectedPrevHash = GENESIS_HASH;
  for (const entry of entries) {
    const recomputedDataHash = sha256(
      stableStringify({
        entityType: entry.entityType,
        entityId: entry.entityId,
        action: entry.action,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        ipAddress: entry.ipAddress,
        beforeState: entry.beforeState,
        afterState: entry.afterState,
        timestamp: entry.timestamp.toISOString(),
      })
    );

    if (recomputedDataHash !== entry.dataHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: "Stored content does not match its recorded data hash (row was altered).",
      };
    }
    if (entry.prevHash !== expectedPrevHash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: "prevHash does not match the hash of the preceding entry (chain broken / row inserted, deleted, or reordered).",
      };
    }
    const recomputedHash = sha256(entry.prevHash + entry.dataHash);
    if (recomputedHash !== entry.hash) {
      return {
        valid: false,
        totalEntries: entries.length,
        brokenAtSequence: entry.sequence,
        reason: "Stored hash does not match recomputed hash.",
      };
    }

    expectedPrevHash = entry.hash;
  }

  return { valid: true, totalEntries: entries.length, brokenAtSequence: null, reason: null };
}

export interface AuditQuery {
  entityType?: string;
  entityId?: string;
  actorId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
}

export async function queryAuditLog(q: AuditQuery) {
  const page = q.page && q.page > 0 ? q.page : 1;
  const pageSize = q.pageSize && q.pageSize > 0 && q.pageSize <= 500 ? q.pageSize : 100;

  const where: Prisma.AuditLogWhereInput = {
    entityType: q.entityType,
    entityId: q.entityId,
    actorId: q.actorId,
    action: q.action,
    timestamp:
      q.from || q.to
        ? {
            gte: q.from,
            lte: q.to,
          }
        : undefined,
  };

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { sequence: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { actor: { select: { id: true, fullName: true, email: true, role: true } } },
    }),
  ]);

  return { total, page, pageSize, entries };
}
