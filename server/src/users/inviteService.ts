import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../db";
import { appendAuditEntry } from "../audit/auditService";
import { AuthUser } from "../middleware/auth";
import { badRequest, conflict, notFound } from "../orders/errors";
import { isEmailConfigured, sendInviteEmail } from "../notifications/emailService";

const INVITE_TTL_DAYS = 7;

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export interface CreateClientInput {
  fullName: string;
  email: string;
  clientCode?: string;
  jurisdiction?: string;
}

export interface InviteResult {
  userId: string;
  email: string;
  fullName: string;
  inviteUrl: string;
  emailed: boolean;
  // Only set if emailed is false AND SMTP was configured but sending itself failed (as
  // opposed to the normal, expected case of SMTP not being configured at all) -- the account
  // was still created successfully either way, so this is a warning, not an error.
  emailWarning?: string;
}

/** Creates a CLIENT account with no password and a one-time invite link. The account can't be
 * logged into until the invite is redeemed via acceptInvite. If SMTP is configured, also
 * attempts to email the link; either way the link is returned so the caller (a dealer/
 * compliance/admin user) can share it manually. */
export async function createClientInvite(
  actor: AuthUser,
  input: CreateClientInput,
  baseUrl: string,
  ipAddress: string
): Promise<InviteResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict(`A user with email ${input.email} already exists`);
  if (input.clientCode) {
    const existingCode = await prisma.user.findUnique({ where: { clientCode: input.clientCode } });
    if (existingCode) throw conflict(`Client code ${input.clientCode} is already in use`);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const { user } = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        role: "CLIENT",
        clientCode: input.clientCode,
        jurisdiction: input.jurisdiction,
        passwordHash: null,
      },
    });
    const invite = await tx.invite.create({
      data: {
        userId: createdUser.id,
        tokenHash,
        invitedById: actor.id,
        expiresAt,
      },
    });
    await appendAuditEntry(tx, {
      entityType: "User",
      entityId: createdUser.id,
      action: "CLIENT_INVITED",
      actorId: actor.id,
      actorRole: actor.role,
      ipAddress,
      after: { email: createdUser.email, fullName: createdUser.fullName, inviteExpiresAt: invite.expiresAt },
    });
    return { user: createdUser, invite };
  });

  const inviteUrl = `${baseUrl}/invite/${rawToken}`;
  const emailResult = await sendInviteEmail(user.email, user.fullName, inviteUrl);
  if (emailResult.sent) {
    await prisma.invite.update({ where: { userId: user.id }, data: { emailedAt: new Date() } });
  }

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    inviteUrl,
    emailed: emailResult.sent,
    emailWarning: !emailResult.sent && isEmailConfigured() ? emailResult.error : undefined,
  };
}

export async function bulkCreateClientInvites(
  actor: AuthUser,
  clients: CreateClientInput[],
  baseUrl: string,
  ipAddress: string
): Promise<Array<InviteResult | { email: string; error: string }>> {
  const results: Array<InviteResult | { email: string; error: string }> = [];
  for (const client of clients) {
    try {
      results.push(await createClientInvite(actor, client, baseUrl, ipAddress));
    } catch (err) {
      results.push({ email: client.email, error: err instanceof Error ? err.message : "Failed to create account" });
    }
  }
  return results;
}

export async function acceptInvite(rawToken: string, newPassword: string, ipAddress: string) {
  const tokenHash = sha256(rawToken);
  const invite = await prisma.invite.findUnique({ where: { tokenHash }, include: { user: true } });

  if (!invite) throw notFound("Invite link is invalid");
  if (invite.usedAt) throw badRequest("This invite link has already been used");
  if (invite.expiresAt < new Date()) throw badRequest("This invite link has expired");

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: invite.userId }, data: { passwordHash } });
    await tx.invite.update({ where: { id: invite.id }, data: { usedAt: new Date() } });
    await appendAuditEntry(tx, {
      entityType: "User",
      entityId: invite.userId,
      action: "CLIENT_INVITE_ACCEPTED",
      actorId: invite.userId,
      actorRole: "CLIENT",
      ipAddress,
    });
  });

  return { email: invite.user.email };
}

export async function checkInvite(rawToken: string) {
  const tokenHash = sha256(rawToken);
  const invite = await prisma.invite.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!invite) throw notFound("Invite link is invalid");
  if (invite.usedAt) throw badRequest("This invite link has already been used");
  if (invite.expiresAt < new Date()) throw badRequest("This invite link has expired");
  return { email: invite.user.email, fullName: invite.user.fullName };
}
