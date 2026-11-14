import { Router } from "express";
import type { MongoConnection } from "../config/mongo.js";

export interface HealthRouterOptions {
  mongo?: MongoConnection;
}

export function createHealthRouter(options: HealthRouterOptions = {}) {
  const { mongo } = options;
  const router = Router();

  // Liveness: Express is up. Never touches MongoDB.
  router.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
    });
  });

  // Readiness: verifies the real MongoDB state. 200 when connected, 503 otherwise.
  // The response only exposes the coarse state, never the URI or credentials.
  router.get("/ready", async (_req, res) => {
    if (!mongo) {
      res.status(503).json({
        status: "not_ready",
        mongo: { state: "unconfigured", configured: false },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const { state, configured } = await mongo.status();
    const ready = state === "connected";

    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "not_ready",
      mongo: { state, configured },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}