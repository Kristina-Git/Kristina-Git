import { Router } from "express";
import { prisma } from "../db";
import { clientIp, requireAuth, requireRole } from "../middleware/auth";
import { createClientSchema, bulkImportSchema } from "./validation";
import { createClientInvite, bulkCreateClientInvites } from "./inviteService";
import { parseClientRows } from "./csvClients";
import { OrderError } from "../orders/errors";

export const userRouter = Router();
userRouter.use(requireAuth);

// The public URL invite links get built against. APP_BASE_URL overrides the request-derived
// origin for cases where that's not actually the address a person should open: running the
// client and server as separate local dev processes (the server sees its own :4000, not the
// Vite dev server's :5173 that a human is actually browsing), or a custom domain/CDN in front
// of the deployed app that Express itself doesn't see.
function baseUrlFor(req: import("express").Request): string {
  return process.env.APP_BASE_URL ?? `${req.protocol}://${req.get("host")}`;
}

// Lets dealers/compliance/admin pick a client when entering an order on their behalf, and
// powers the Clients management page. `includeInactive=true` also returns deactivated
// accounts (management view only -- the order-entry dropdown never wants those).
userRouter.get("/clients", requireRole("DEALER", "COMPLIANCE_OFFICER", "ADMIN"), async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", ...(includeInactive ? {} : { isActive: true }) },
    select: {
      id: true,
      fullName: true,
      email: true,
      clientCode: true,
      jurisdiction: true,
      isActive: true,
      passwordHash: true,
      createdAt: true,
    },
    orderBy: { fullName: "asc" },
  });
  res.json(
    clients.map(({ passwordHash, ...c }) => ({
      ...c,
      activated: passwordHash !== null,
    }))
  );
});

// Creates a CLIENT account with no password and returns a one-time invite link for the
// dealer/compliance/admin who created it to share (or, if SMTP is configured, emails it
// automatically -- see notifications/emailService.ts).
userRouter.post("/clients", requireRole("DEALER", "COMPLIANCE_OFFICER", "ADMIN"), async (req, res) => {
  const parsed = createClientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const result = await createClientInvite(req.user!, parsed.data, baseUrlFor(req), clientIp(req));
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

// Bulk version: pastes a CSV (or Excel copy-paste, which is tab-separated) of clients and
// creates an invite for each valid row. Restricted to compliance/admin since it's a bulk,
// harder-to-review action compared to the single-client form.
userRouter.post("/clients/bulk", requireRole("COMPLIANCE_OFFICER", "ADMIN"), async (req, res) => {
  const parsed = bulkImportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });

  const rows = parseClientRows(parsed.data.csv);
  const validRows = rows.filter((r) => r.client);
  if (rows.length > 0 && validRows.length === 0 && rows[0].error?.startsWith("Header row")) {
    return res.status(400).json({ error: rows[0].error });
  }
  if (validRows.length > 500) {
    return res.status(400).json({ error: "Limit 500 clients per import" });
  }

  const created = await bulkCreateClientInvites(
    req.user!,
    validRows.map((r) => r.client!),
    baseUrlFor(req),
    clientIp(req)
  );

  const rowErrors = rows.filter((r) => r.error).map((r) => ({ row: r.row, error: r.error! }));
  res.json({ created, rowErrors });
});

userRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, fullName: true, role: true, clientCode: true, jurisdiction: true, mfaEnabled: true },
  });
  res.json(user);
});
