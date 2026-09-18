import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { clientIp, signPreAuthToken, signToken } from "../middleware/auth";
import { appendAuditEntry } from "../audit/auditService";
import { Role } from "../types";
import { mfaRouter } from "./mfaRoutes";
import { acceptInvite, checkInvite } from "../users/inviteService";
import { acceptInviteSchema } from "../users/validation";
import { OrderError } from "../orders/errors";

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user?.passwordHash ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !ok || !user.isActive) {
    await appendAuditEntry(prisma, {
      entityType: "Auth",
      entityId: user?.id ?? email,
      action: "LOGIN_FAILURE",
      actorId: user?.id,
      actorRole: (user?.role as Role) ?? undefined,
      ipAddress: clientIp(req),
    });
    if (user && !user.passwordHash) {
      return res
        .status(401)
        .json({ error: "This account hasn't been activated yet. Check your email for a setup link." });
    }
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (user.mfaEnabled) {
    await appendAuditEntry(prisma, {
      entityType: "Auth",
      entityId: user.id,
      action: "LOGIN_PASSWORD_VERIFIED_MFA_PENDING",
      actorId: user.id,
      actorRole: user.role as Role,
      ipAddress: clientIp(req),
    });
    return res.json({ mfaRequired: true, preAuthToken: signPreAuthToken({ id: user.id, email: user.email }) });
  }

  await appendAuditEntry(prisma, {
    entityType: "Auth",
    entityId: user.id,
    action: "LOGIN_SUCCESS",
    actorId: user.id,
    actorRole: user.role as Role,
    ipAddress: clientIp(req),
  });

  const token = signToken({ id: user.id, role: user.role as Role, email: user.email });
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      clientCode: user.clientCode,
      mfaEnabled: user.mfaEnabled,
    },
  });
});

// Lets the Accept Invite page confirm a link is valid (and show who it's for) before asking
// for a password. No auth required -- the token itself is the credential at this stage.
authRouter.get("/invite/:token", async (req, res) => {
  try {
    const info = await checkInvite(req.params.token);
    res.json(info);
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

authRouter.post("/accept-invite", async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
  try {
    const result = await acceptInvite(parsed.data.token, parsed.data.password, clientIp(req));
    res.json(result);
  } catch (err) {
    if (err instanceof OrderError) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

authRouter.use("/mfa", mfaRouter);
