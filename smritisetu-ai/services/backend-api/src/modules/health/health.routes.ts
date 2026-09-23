import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { mlClient } from "../../lib/mlClient";
import { env } from "../../config/env";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "smritisetu-backend-api",
    version: "1.0.0",
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

/**
 * Readiness reflects dependencies. The ML service being down is reported but
 * does NOT make the API unready — games and sync must keep working without it.
 */
healthRouter.get("/ready", async (_req, res) => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch (error) {
    checks.database = { ok: false, detail: error instanceof Error ? error.message : "unreachable" };
  }

  const mlOk = await mlClient.health();
  checks.mlService = {
    ok: mlOk,
    detail: mlOk
      ? undefined
      : env.ML_SERVICE_ENABLED
        ? "unreachable — difficulty stays at its current level and evaluation is queued"
        : "disabled by configuration",
  };

  const ready = checks.database.ok;
  res.status(ready ? 200 : 503).json({
    status: ready ? "ready" : "not_ready",
    checks,
    time: new Date().toISOString(),
  });
});
