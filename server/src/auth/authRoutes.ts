import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { clientIp, signPreAuthToken, signToken } from "../middleware/auth";
import { appendAuditEntry } from "../audit/auditService";
import { Role } from "../types";
import { mfaRouter } from "./mfaRoutes";

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
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;

  if (!user || !ok || !user.isActive) {
    await appendAuditEntry(prisma, {
      entityType: "Auth",
      entityId: email,
      action: "LOGIN_FAILURE",
      ipAddress: clientIp(req),
    });
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

authRouter.use("/mfa", mfaRouter);
