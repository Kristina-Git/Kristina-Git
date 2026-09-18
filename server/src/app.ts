import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import { authRouter } from "./auth/authRoutes";
import { orderRouter } from "./orders/orderRoutes";
import { auditRouter } from "./audit/auditRoutes";
import { userRouter } from "./users/userRoutes";

// In production this server also serves the built React app, so the whole thing is one
// deployable service with one URL (no separate frontend host, no CORS to configure). In
// local dev the client instead runs on its own Vite dev server and proxies /api/* here, so
// this directory won't exist and is skipped.
const CLIENT_DIST = path.join(__dirname, "..", "..", "client", "dist");

export function createApp() {
  const app = express();
  app.set("trust proxy", true);
  app.use(cors());
  app.use(express.json());

  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
  }

  const apiRouter = express.Router();
  apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));
  apiRouter.use("/auth", authRouter);
  apiRouter.use("/orders", orderRouter);
  apiRouter.use("/audit", auditRouter);
  apiRouter.use("/users", userRouter);

  // Mounted twice deliberately: unprefixed for tests/local curl (matches the existing test
  // suite, which calls e.g. POST /auth/login directly against the app), and under /api for
  // the built client, which in production always calls same-origin /api/* (there's no dev
  // proxy to rewrite the prefix once this is one deployed service).
  app.use(apiRouter);
  app.use("/api", apiRouter);

  // SPA fallback: any other GET (e.g. a browser refresh on /dealer or /compliance/audit)
  // serves the React app, which then handles routing client-side.
  if (fs.existsSync(CLIENT_DIST)) {
    app.get("*", (_req, res) => res.sendFile(path.join(CLIENT_DIST, "index.html")));
  }

  app.use((_req, res) => res.status(404).json({ error: "Not found" }));

  return app;
}
