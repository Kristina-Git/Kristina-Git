import { z } from "zod";

export const createClientSchema = z.object({
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  clientCode: z.string().max(50).optional(),
  jurisdiction: z.string().max(100).optional(),
});

export const bulkImportSchema = z.object({
  csv: z.string().min(1).max(200_000),
});

export const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
