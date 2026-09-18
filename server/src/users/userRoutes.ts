import { Router } from "express";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const userRouter = Router();
userRouter.use(requireAuth);

// Lets dealers/compliance/admin pick a client when entering an order on their behalf.
userRouter.get("/clients", requireRole("DEALER", "COMPLIANCE_OFFICER", "ADMIN"), async (_req, res) => {
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", isActive: true },
    select: { id: true, fullName: true, email: true, clientCode: true, jurisdiction: true },
    orderBy: { fullName: "asc" },
  });
  res.json(clients);
});

userRouter.get("/me", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, email: true, fullName: true, role: true, clientCode: true, jurisdiction: true, mfaEnabled: true },
  });
  res.json(user);
});
