import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { clientIp, requireAuth, signToken, verifyPreAuthToken } from "../middleware/auth";
import { appendAuditEntry } from "../audit/auditService";
import { generateSecret, keyUri, qrCodeDataUrl, verifyToken } from "./mfaService";
import { Role } from "../types";

export const mfaRouter = Router();

/** Step 2 of login for a user with MFA enabled: exchanges the short-lived pre-auth token
 * (issued by POST /auth/login after password verification) plus a valid TOTP code for a
 * full session token. Deliberately does NOT go through requireAuth — the caller isn't fully
 * authenticated yet, that's the point of this endpoint. */
const verifySchema = z.object({
  preAuthToken: z.string().min(1),
  code: z.string().min(6).max(6),
});

mfaRouter.post("/verify", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });

  const pre = verifyPreAuthToken(parsed.data.preAuthToken);
  if (!pre) return res.status(401).json({ error: "MFA challenge expired or invalid; please log in again" });

  const user = await prisma.user.findUnique({ where: { id: pre.id } });
  if (!user || !user.mfaEnabled || !user.mfaSecret || !user.isActive) {
    return res.status(401).json({ error: "MFA is not active for this account" });
  }

  if (!verifyToken(parsed.data.code, user.mfaSecret)) {
    await appendAuditEntry(prisma, {
      entityType: "Auth",
      entityId: user.id,
      action: "MFA_LOGIN_FAILURE",
      actorId: user.id,
      actorRole: user.role as Role,
      ipAddress: clientIp(req),
    });
    return res.status(401).json({ error: "Invalid authentication code" });
  }

  await appendAuditEntry(prisma, {
    entityType: "Auth",
    entityId: user.id,
    action: "LOGIN_SUCCESS",
    actorId: user.id,
    actorRole: user.role as Role,
    ipAddress: clientIp(req),
    after: { via: "mfa" },
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

mfaRouter.use(requireAuth);

/** Begins enrollment: generates a new secret (stored but not yet active) and returns it as
 * both a scannable QR code and a manual-entry otpauth URI. Enrollment isn't complete until
 * POST /enable proves the user can generate a valid code from it. */
mfaRouter.post("/setup", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  const secret = generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: secret, mfaEnabled: false } });

  const uri = keyUri(user.email, secret);
  await appendAuditEntry(prisma, {
    entityType: "Auth",
    entityId: user.id,
    action: "MFA_SETUP_INITIATED",
    actorId: user.id,
    actorRole: user.role as Role,
    ipAddress: clientIp(req),
  });

  res.json({ secret, otpauthUri: uri, qrCodeDataUrl: await qrCodeDataUrl(uri) });
});

const codeSchema = z.object({ code: z.string().min(6).max(6) });

mfaRouter.post("/enable", async (req, res) => {
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.mfaSecret) return res.status(409).json({ error: "Call /auth/mfa/setup first" });

  if (!verifyToken(parsed.data.code, user.mfaSecret)) {
    return res.status(400).json({ error: "Invalid authentication code" });
  }

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
  await appendAuditEntry(prisma, {
    entityType: "Auth",
    entityId: user.id,
    action: "MFA_ENABLED",
    actorId: user.id,
    actorRole: user.role as Role,
    ipAddress: clientIp(req),
  });

  res.json({ mfaEnabled: true });
});

const disableSchema = z.object({ password: z.string().min(1) });

mfaRouter.post("/disable", async (req, res) => {
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User not found" });

  // Step-up re-authentication: a live session token alone isn't enough to turn off a
  // security control, in case the session itself is what's compromised.
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ error: "Incorrect password" });
  }

  await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
  await appendAuditEntry(prisma, {
    entityType: "Auth",
    entityId: user.id,
    action: "MFA_DISABLED",
    actorId: user.id,
    actorRole: user.role as Role,
    ipAddress: clientIp(req),
  });

  res.json({ mfaEnabled: false });
});
