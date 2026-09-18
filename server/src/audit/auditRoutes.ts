import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth";
import { queryAuditLog, verifyChain } from "./auditService";

export const auditRouter = Router();

// The audit trail is restricted to Compliance and Admin: clients and dealers can see the
// order-level history for their own orders via /orders/:id, but the full, cross-entity
// system audit log is a compliance/regulatory surface.
auditRouter.use(requireAuth, requireRole("COMPLIANCE_OFFICER", "ADMIN"));

auditRouter.get("/", async (req, res) => {
  const { entityType, entityId, actorId, action, from, to, page, pageSize } = req.query;
  const result = await queryAuditLog({
    entityType: entityType as string | undefined,
    entityId: entityId as string | undefined,
    actorId: actorId as string | undefined,
    action: action as string | undefined,
    from: from ? new Date(from as string) : undefined,
    to: to ? new Date(to as string) : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  });
  res.json(result);
});

/** Recomputes the hash chain end-to-end and reports whether the record set is intact.
 * This is the control a CIMA examiner or internal compliance officer would run to confirm
 * that no historical order or audit record has been silently altered. */
auditRouter.get("/verify", async (_req, res) => {
  const result = await verifyChain();
  res.json(result);
});

auditRouter.get("/export.csv", async (req, res) => {
  const { entityType, entityId, from, to } = req.query;
  const { entries } = await queryAuditLog({
    entityType: entityType as string | undefined,
    entityId: entityId as string | undefined,
    from: from ? new Date(from as string) : undefined,
    to: to ? new Date(to as string) : undefined,
    pageSize: 500,
  });

  const header = [
    "sequence",
    "timestamp",
    "entityType",
    "entityId",
    "action",
    "actorEmail",
    "actorRole",
    "ipAddress",
    "hash",
  ];
  const rows = entries.map((e) =>
    [
      e.sequence,
      e.timestamp.toISOString(),
      e.entityType,
      e.entityId,
      e.action,
      e.actor?.email ?? "",
      e.actorRole ?? "",
      e.ipAddress ?? "",
      e.hash,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="audit-trail-export.csv"`);
  res.send([header.join(","), ...rows].join("\n"));
});
