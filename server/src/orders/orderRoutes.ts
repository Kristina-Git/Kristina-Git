import { Router } from "express";
import { OrderStatus } from "../types";
import { clientIp, requireAuth, requireRole } from "../middleware/auth";
import {
  cancelOrderSchema,
  complianceDecisionSchema,
  createOrderSchema,
  executeOrderSchema,
  flagOrderSchema,
  rejectOrderSchema,
} from "./validation";
import {
  acceptOrder,
  approveCompliance,
  cancelOrder,
  createOrder,
  executeOrder,
  flagOrder,
  getOrder,
  listOrders,
  rejectOrder,
} from "./orderService";
import { OrderError } from "./errors";

export const orderRouter = Router();
orderRouter.use(requireAuth);

function handle(res: import("express").Response, err: unknown) {
  if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
  // Zod validation errors are handled at the call site; anything else is unexpected.
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

orderRouter.post("/", requireRole("CLIENT", "DEALER", "ADMIN"), async (req, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const order = await createOrder(req.user!, parsed.data, clientIp(req));
    res.status(201).json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.get("/", async (req, res) => {
  const { status, clientId, instrumentSymbol } = req.query;
  const orders = await listOrders(req.user!, {
    status: status as OrderStatus | undefined,
    clientId: clientId as string | undefined,
    instrumentSymbol: instrumentSymbol as string | undefined,
  });
  res.json(orders);
});

// A clean, per-order trade blotter (as opposed to /audit/export.csv, which is the raw
// system-wide action log). A CLIENT always gets only their own orders regardless of
// ?clientId; DEALER/COMPLIANCE_OFFICER/ADMIN can pass ?clientId to get one client's activity,
// or omit it for everyone's. Registered before /:id so "export.csv" isn't parsed as an order id.
orderRouter.get("/export.csv", async (req, res) => {
  const { status, clientId, instrumentSymbol } = req.query;
  const orders = await listOrders(req.user!, {
    status: status as OrderStatus | undefined,
    clientId: clientId as string | undefined,
    instrumentSymbol: instrumentSymbol as string | undefined,
  });

  const header = [
    "orderNumber",
    "clientName",
    "clientCode",
    "instrumentSymbol",
    "side",
    "orderType",
    "quantity",
    "limitPrice",
    "currency",
    "timeInForce",
    "status",
    "executedPrice",
    "executedQuantity",
    "executedAt",
    "custodianName",
    "custodianReference",
    "rejectionReason",
    "complianceFlag",
    "createdAt",
    "retentionUntil",
  ];
  const rows = orders.map((o) =>
    [
      o.orderNumber,
      o.client?.fullName ?? "",
      o.client?.clientCode ?? "",
      o.instrumentSymbol,
      o.side,
      o.orderType,
      o.quantity,
      o.limitPrice ?? "",
      o.currency,
      o.timeInForce,
      o.status,
      o.executedPrice ?? "",
      o.executedQuantity ?? "",
      o.executedAt?.toISOString() ?? "",
      o.custodianName ?? "",
      o.custodianReference ?? "",
      o.rejectionReason ?? "",
      o.complianceFlag,
      o.createdAt.toISOString(),
      o.retentionUntil.toISOString(),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const clientSuffix = clientId ? `-${orders[0]?.client?.clientCode ?? "client"}` : "";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="trade-report${clientSuffix}.csv"`);
  res.send([header.join(","), ...rows].join("\n"));
});

orderRouter.get("/:id", async (req, res) => {
  try {
    const order = await getOrder(req.user!, req.params.id);
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.post("/:id/accept", requireRole("DEALER", "ADMIN"), async (req, res) => {
  try {
    const order = await acceptOrder(req.user!, req.params.id, clientIp(req));
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.post("/:id/reject", requireRole("DEALER", "COMPLIANCE_OFFICER", "ADMIN"), async (req, res) => {
  const parsed = rejectOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const order = await rejectOrder(req.user!, req.params.id, parsed.data.reason, clientIp(req));
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.post("/:id/compliance-approve", requireRole("COMPLIANCE_OFFICER", "ADMIN"), async (req, res) => {
  const parsed = complianceDecisionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const order = await approveCompliance(req.user!, req.params.id, parsed.data.notes, clientIp(req));
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.post("/:id/execute", requireRole("DEALER", "ADMIN"), async (req, res) => {
  const parsed = executeOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const order = await executeOrder(req.user!, req.params.id, parsed.data, clientIp(req));
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.post("/:id/cancel", async (req, res) => {
  const parsed = cancelOrderSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const order = await cancelOrder(req.user!, req.params.id, parsed.data.reason, clientIp(req));
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});

orderRouter.post("/:id/flag", requireRole("COMPLIANCE_OFFICER", "ADMIN"), async (req, res) => {
  const parsed = flagOrderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const order = await flagOrder(req.user!, req.params.id, parsed.data.notes, clientIp(req));
    res.json(order);
  } catch (err) {
    handle(res, err);
  }
});
