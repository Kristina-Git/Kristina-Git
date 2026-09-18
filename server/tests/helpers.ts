import bcrypt from "bcryptjs";
import { prisma } from "../src/db";
import { signToken } from "../src/middleware/auth";
import { Role } from "../src/types";

export async function makeUser(role: Role, emailPrefix: string, extra: Record<string, string> = {}) {
  const email = `${emailPrefix}-${Math.random().toString(36).slice(2, 8)}@test.example`;
  const passwordHash = await bcrypt.hash("password", 4);
  const user = await prisma.user.create({
    data: { email, fullName: emailPrefix, role, passwordHash, ...extra },
  });
  const token = signToken({ id: user.id, role: user.role as Role, email: user.email });
  return { user, token };
}

export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
