import { Order, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { appendAuditEntry } from "../audit/auditService";
import { AuthUser } from "../middleware/auth";
import { OrderStatus } from "../types";
import { badRequest, conflict, forbidden, notFound } from "./errors";

/** Minimum record-retention period applied to every order at creation, aligned with the
 * business-records retention themes in CIMA's regulatory regime (SIBA / AML Regulations).
 * See COMPLIANCE.md — confirm the applicable period with counsel for your specific licence. */
export const RETENTION_YEARS = 7;

/** Orders at or above this notional value (or any MARKET order, whose notional is unknown at
 * entry) require Compliance Officer sign-off before execution — a four-eyes control. */
const COMPLIANCE_APPROVAL_THRESHOLD = Number(process.env.COMPLIANCE_APPROVAL_THRESHOLD ?? 100_000);

function retentionDate(from: Date): Date {
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + RETENTION_YEARS);
  return d;
}

/** Human-readable, collision-safe order reference (not a sequential regulatory ID — the
 * append-only, sequence-numbered audit log is the authoritative ordering). */
function nextOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

function requiresComplianceApproval(order: Pick<Order, "orderType" | "quantity" | "limitPrice">): boolean {
  if (order.orderType === "MARKET" || order.limitPrice === null || order.limitPrice === undefined) {
    return true; // notional unknown until fill - conservative default
  }
  return order.quantity * order.limitPrice >= COMPLIANCE_APPROVAL_THRESHOLD;
}

export interface CreateOrderInput {
  clientId?: string;
  instrumentSymbol: string;
  instrumentName?: string;
  side: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "STOP";
  quantity: number;
  limitPrice?: number;
  currency: string;
  timeInForce: "DAY" | "GTC" | "IOC" | "FOK";
}

export async function createOrder(actor: AuthUser, input: CreateOrderInput, ipAddress: string) {
  let clientId: string;
  if (actor.role === "CLIENT") {
    clientId = actor.id;
  } else if (actor.role === "DEALER" || actor.role === "ADMIN") {
    if (!input.clientId) throw badRequest("clientId is required when a dealer enters an order on behalf of a client");
    const client = await prisma.user.findUnique({ where: { id: input.clientId } });
    if (!client || client.role !== "CLIENT") throw badRequest("clientId does not refer to a valid client");
    clientId = client.id;
  } else {
    throw forbidden("Only clients and dealers may submit orders");
  }

  const orderNumber = nextOrderNumber();
  const now = new Date();
  const initialStatus: OrderStatus = "PENDING_REVIEW";

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        orderNumber,
        clientId,
        createdById: actor.id,
        instrumentSymbol: input.instrumentSymbol.toUpperCase(),
        instrumentName: input.instrumentName,
        side: input.side,
        orderType: input.orderType,
        quantity: input.quantity,
        limitPrice: input.limitPrice,
        currency: input.currency,
        timeInForce: input.timeInForce,
        status: initialStatus,
        retentionUntil: retentionDate(now),
      },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: null,
        toStatus: initialStatus,
        actorId: actor.id,
        actorRole: actor.role,
        reason: "Order submitted",
      },
    });

    await appendAuditEntry(tx, {
      entityType: "Order",
      entityId: order.id,
      action: "ORDER_CREATED",
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      after: order,
    });

    return order;
  });
}

async function loadOrderOrThrow(tx: Prisma.TransactionClient, orderId: string): Promise<Order> {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFound();
  return order;
}

function assertClientOwnsOrReviewer(actor: AuthUser, order: Order) {
  if (actor.role === "CLIENT" && order.clientId !== actor.id) {
    throw forbidden("You may only access your own orders");
  }
}

export async function getOrder(actor: AuthUser, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, fullName: true, role: true } } } },
      client: { select: { id: true, fullName: true, email: true, clientCode: true } },
    },
  });
  if (!order) throw notFound();
  assertClientOwnsOrReviewer(actor, order);
  return order;
}

export interface ListOrdersFilter {
  status?: OrderStatus;
  clientId?: string;
  instrumentSymbol?: string;
}

export async function listOrders(actor: AuthUser, filter: ListOrdersFilter) {
  const where: Prisma.OrderWhereInput = {
    status: filter.status,
    instrumentSymbol: filter.instrumentSymbol?.toUpperCase(),
    clientId: actor.role === "CLIENT" ? actor.id : filter.clientId,
  };
  return prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { client: { select: { id: true, fullName: true, clientCode: true } } },
  });
}

async function transition(
  actor: AuthUser,
  orderId: string,
  ipAddress: string,
  allowedFrom: OrderStatus[],
  mutate: (order: Order) => { toStatus: OrderStatus; data: Prisma.OrderUpdateInput; reason?: string; action: string }
) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderOrThrow(tx, orderId);
    if (!(allowedFrom as string[]).includes(order.status)) {
      throw conflict(`Order is in status ${order.status}; expected one of ${allowedFrom.join(", ")}`);
    }

    const { toStatus, data, reason, action } = mutate(order);

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { ...data, status: toStatus, version: { increment: 1 } },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus,
        actorId: actor.id,
        actorRole: actor.role,
        reason,
      },
    });

    await appendAuditEntry(tx, {
      entityType: "Order",
      entityId: order.id,
      action,
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      before: order,
      after: updated,
    });

    return updated;
  });
}

/** DEALER (or ADMIN) accepts a pending order. Enforces maker-checker: the accepting user
 * cannot be the same user who created the order. Large / market orders route to compliance
 * approval instead of straight to ACCEPTED. */
export async function acceptOrder(actor: AuthUser, orderId: string, ipAddress: string) {
  if (actor.role !== "DEALER" && actor.role !== "ADMIN") throw forbidden("Only dealers may accept orders");

  return transition(actor, orderId, ipAddress, ["PENDING_REVIEW"], (order) => {
    if (order.createdById === actor.id) {
      throw conflict("Four-eyes violation: the dealer who accepts an order must differ from the user who entered it");
    }
    const needsCompliance = requiresComplianceApproval(order);
    return {
      toStatus: needsCompliance ? "PENDING_COMPLIANCE_APPROVAL" : "ACCEPTED",
      data: {},
      reason: needsCompliance ? "Accepted; routed for compliance approval (threshold/market order)" : "Accepted by dealer",
      action: needsCompliance ? "ORDER_ROUTED_TO_COMPLIANCE" : "ORDER_ACCEPTED",
    };
  });
}

export async function rejectOrder(actor: AuthUser, orderId: string, reason: string, ipAddress: string) {
  if (!["DEALER", "COMPLIANCE_OFFICER", "ADMIN"].includes(actor.role)) {
    throw forbidden("Only dealers or compliance officers may reject orders");
  }
  return transition(actor, orderId, ipAddress, ["PENDING_REVIEW", "PENDING_COMPLIANCE_APPROVAL"], () => ({
    toStatus: "REJECTED",
    data: { rejectionReason: reason },
    reason,
    action: "ORDER_REJECTED",
  }));
}

/** COMPLIANCE_OFFICER approves an order that breached the auto-review threshold. Enforces
 * four-eyes: the approving compliance officer cannot be the user who originally entered the
 * order. */
export async function approveCompliance(actor: AuthUser, orderId: string, notes: string | undefined, ipAddress: string) {
  if (actor.role !== "COMPLIANCE_OFFICER" && actor.role !== "ADMIN") {
    throw forbidden("Only compliance officers may approve orders");
  }
  return transition(actor, orderId, ipAddress, ["PENDING_COMPLIANCE_APPROVAL"], (order) => {
    if (order.createdById === actor.id) {
      throw conflict("Four-eyes violation: the compliance approver must differ from the user who entered the order");
    }
    return {
      toStatus: "COMPLIANCE_APPROVED",
      data: { complianceNotes: notes },
      reason: notes ?? "Compliance approved",
      action: "ORDER_COMPLIANCE_APPROVED",
    };
  });
}

export interface ExecuteOrderInput {
  executedPrice: number;
  executedQuantity: number;
  custodianName?: string;
  custodianReference?: string;
}

export async function executeOrder(actor: AuthUser, orderId: string, input: ExecuteOrderInput, ipAddress: string) {
  if (actor.role !== "DEALER" && actor.role !== "ADMIN") throw forbidden("Only dealers may execute orders");

  return transition(actor, orderId, ipAddress, ["ACCEPTED", "COMPLIANCE_APPROVED"], (order) => {
    if (input.executedQuantity > order.quantity) {
      throw badRequest("executedQuantity cannot exceed the ordered quantity");
    }
    return {
      toStatus: "EXECUTED",
      data: {
        executedPrice: input.executedPrice,
        executedQuantity: input.executedQuantity,
        executedAt: new Date(),
        custodianName: input.custodianName,
        custodianReference: input.custodianReference,
      },
      reason: `Executed ${input.executedQuantity} @ ${input.executedPrice}${
        input.custodianName ? ` via ${input.custodianName}` : ""
      }${input.custodianReference ? ` (ref ${input.custodianReference})` : ""}`,
      action: "ORDER_EXECUTED",
    };
  });
}

const CANCELLABLE_STATUSES: OrderStatus[] = [
  "PENDING_REVIEW",
  "ACCEPTED",
  "PENDING_COMPLIANCE_APPROVAL",
  "COMPLIANCE_APPROVED",
];

export async function cancelOrder(actor: AuthUser, orderId: string, reason: string | undefined, ipAddress: string) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderOrThrow(tx, orderId);
    if (actor.role === "CLIENT" && order.clientId !== actor.id) {
      throw forbidden("You may only cancel your own orders");
    }
    if (!(CANCELLABLE_STATUSES as string[]).includes(order.status)) {
      throw conflict(`Order in status ${order.status} can no longer be cancelled`);
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED", version: { increment: 1 } },
    });

    await tx.orderEvent.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        actorId: actor.id,
        actorRole: actor.role,
        reason,
      },
    });

    await appendAuditEntry(tx, {
      entityType: "Order",
      entityId: order.id,
      action: "ORDER_CANCELLED",
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      before: order,
      after: updated,
    });

    return updated;
  });
}

/** Flags an order for AML / best-execution review without changing its lifecycle status.
 * Compliance-only. The flag and rationale are themselves audit-logged. */
export async function flagOrder(actor: AuthUser, orderId: string, notes: string, ipAddress: string) {
  if (actor.role !== "COMPLIANCE_OFFICER" && actor.role !== "ADMIN") {
    throw forbidden("Only compliance officers may flag orders");
  }
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderOrThrow(tx, orderId);
    const updated = await tx.order.update({
      where: { id: order.id },
      data: { complianceFlag: true, complianceNotes: notes, version: { increment: 1 } },
    });

    await appendAuditEntry(tx, {
      entityType: "Order",
      entityId: order.id,
      action: "ORDER_FLAGGED_FOR_REVIEW",
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      before: order,
      after: updated,
    });

    return updated;
  });
}

/** Compliance requests that the client confirm the fee charged on a specific executed order
 * -- e.g. responding to an external auditor sampling transactions. Only compliance/admin can
 * request it, and only on an already-executed order (there's nothing to confirm otherwise). */
export async function requestFeeConfirmation(
  actor: AuthUser,
  orderId: string,
  agreedFeePercent: number,
  ipAddress: string
) {
  if (actor.role !== "COMPLIANCE_OFFICER" && actor.role !== "ADMIN") {
    throw forbidden("Only compliance officers may request fee confirmation");
  }
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderOrThrow(tx, orderId);
    if (order.status !== "EXECUTED") {
      throw conflict("Fee confirmation can only be requested on an executed order");
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        agreedFeePercent,
        feeConfirmationStatus: "PENDING",
        feeConfirmationRequestedAt: new Date(),
        feeConfirmationNote: null,
        feeConfirmationRespondedAt: null,
        version: { increment: 1 },
      },
    });

    await appendAuditEntry(tx, {
      entityType: "Order",
      entityId: order.id,
      action: "FEE_CONFIRMATION_REQUESTED",
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      before: order,
      after: updated,
    });

    return updated;
  });
}

/** Only the order's own client can respond -- that's what gives this evidentiary value for an
 * auditor: it's the client's own authenticated confirmation, not staff attesting on their
 * behalf, recorded in the same hash-chained audit trail as everything else. */
export async function respondToFeeConfirmation(
  actor: AuthUser,
  orderId: string,
  confirmed: boolean,
  note: string | undefined,
  ipAddress: string
) {
  return prisma.$transaction(async (tx) => {
    const order = await loadOrderOrThrow(tx, orderId);
    if (actor.role !== "CLIENT" || order.clientId !== actor.id) {
      throw forbidden("Only the client this order belongs to can respond to a fee confirmation request");
    }
    if (order.feeConfirmationStatus !== "PENDING") {
      throw conflict("There is no pending fee confirmation request on this order");
    }
    if (!confirmed && !note) {
      throw badRequest("A note is required when disputing the fee");
    }

    const updated = await tx.order.update({
      where: { id: order.id },
      data: {
        feeConfirmationStatus: confirmed ? "CONFIRMED" : "DISPUTED",
        feeConfirmationNote: note,
        feeConfirmationRespondedAt: new Date(),
        version: { increment: 1 },
      },
    });

    await appendAuditEntry(tx, {
      entityType: "Order",
      entityId: order.id,
      action: confirmed ? "FEE_CONFIRMED" : "FEE_DISPUTED",
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      before: order,
      after: updated,
    });

    return updated;
  });
}
