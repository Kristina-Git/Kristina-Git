import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Role } from "../types";

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret";

export function signToken(user: AuthUser): string {
  return jwt.sign({ ...user, purpose: "session" }, JWT_SECRET, { expiresIn: "8h" });
}

export interface PreAuthPayload {
  id: string;
  email: string;
  purpose: "mfa";
}

/** Short-lived token issued after password verification when a user has MFA enabled. It
 * proves "you know the password" but deliberately carries no `role`, so it cannot be used
 * against requireAuth/requireRole even if leaked or reused by mistake — only POST
 * /auth/mfa/verify accepts it, and only alongside a valid TOTP code. */
export function signPreAuthToken(user: { id: string; email: string }): string {
  return jwt.sign({ id: user.id, email: user.email, purpose: "mfa" }, JWT_SECRET, { expiresIn: "5m" });
}

export function verifyPreAuthToken(token: string): PreAuthPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as PreAuthPayload;
    if (payload.purpose !== "mfa") return null;
    return payload;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser & { purpose?: string };
    if (payload.purpose !== "session") {
      return res.status(401).json({ error: "This token cannot be used for authenticated requests" });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Not authenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires one of roles: ${roles.join(", ")}` });
    }
    next();
  };
}

/** Best-effort client IP, accounting for a trusted reverse proxy (app.set('trust proxy', ...)). */
export function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}
