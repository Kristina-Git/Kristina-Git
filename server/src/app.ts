import express from "express";
import cors from "cors";
import { authRouter } from "./auth/authRoutes";
import { orderRouter } from "./orders/orderRoutes";
import { auditRouter } from "./audit/auditRoutes";
import { userRouter } from "./users/userRoutes";

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/auth", authRouter);
  app.use("/orders", orderRouter);
  app.use("/audit", auditRouter);
  app.use("/users", userRouter);

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  return app;
}
