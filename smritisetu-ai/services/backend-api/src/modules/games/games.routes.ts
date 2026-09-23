import { Router } from "express";
import { Prisma } from "@prisma/client";
import {
  gameSessionQuerySchema,
  gameSessionSchema,
  sessionPlanQuerySchema,
  trendsQuerySchema,
} from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireDevice, requireUserOrDevice } from "../../middleware/auth";
import { requirePatientAccess } from "../../middleware/patientAccess";
import { prisma } from "../../lib/prisma";
import { writeAudit } from "../../lib/audit";
import { evaluateAdaptation } from "../../services/adaptation";
import { evaluateSessionPlan, getSessionPlans } from "../../services/personalisation";
import { evaluateGameAbandonment } from "../../services/alertEngine";
import { analyseTrends } from "../../services/trends";

export const gamesRouter = Router();

/**
 * Direct (online) game-session submission. The offline path goes through
 * /sync/events; both share the same idempotency guarantee.
 */
gamesRouter.post(
  "/game-sessions",
  requireDevice,
  validate(gameSessionSchema),
  asyncHandler(async (req, res) => {
    const { deviceId, patientId } = req.device!;
    const body = req.body as import("@smritisetu/shared-types").GameSessionInput;

    if (body.patientId !== patientId) {
      res.status(403).json({
        error: { code: "FORBIDDEN", message: "That session belongs to another patient", requestId: req.requestId },
      });
      return;
    }

    const existing = await prisma.gameSession.findUnique({
      where: { deviceId_eventId: { deviceId, eventId: body.eventId } },
    });
    if (existing) {
      res.status(200).json({
        data: { eventId: body.eventId, duplicate: true, sessionId: existing.id },
        requestId: req.requestId,
      });
      return;
    }

    const created = await prisma.gameSession.create({
      data: {
        eventId: body.eventId,
        patientId,
        deviceId,
        gameType: body.gameType,
        difficulty: body.difficulty,
        accuracy: body.accuracy,
        responseTimeSeconds: body.responseTimeSeconds,
        hintsUsed: body.hintsUsed,
        attempts: body.attempts,
        completed: body.completed,
        abandoned: body.abandoned,
        engagementDurationSeconds: body.engagementDurationSeconds,
        playedAt: new Date(body.playedAt),
        detail: (body.detail ?? {}) as Prisma.InputJsonValue,
      },
    });

    const adaptation = await evaluateAdaptation(patientId, body.gameType);
    const sessionPlan = await evaluateSessionPlan(patientId, body.gameType);
    await evaluateGameAbandonment(patientId);
    await writeAudit(req, {
      action: "GAME_SESSION_RECORDED",
      resource: "GameSession",
      resourceId: created.id,
      patientId,
      metadata: { gameType: body.gameType, difficulty: body.difficulty },
    });

    res.status(201).json({
      data: { eventId: body.eventId, duplicate: false, sessionId: created.id, adaptation, sessionPlan },
      requestId: req.requestId,
    });
  }),
);

gamesRouter.get(
  "/patients/:patientId/game-sessions",
  requireUserOrDevice,
  requirePatientAccess(),
  validate(gameSessionQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as { gameType?: string; limit: number; since?: string };
    const sessions = await prisma.gameSession.findMany({
      where: {
        patientId: req.params.patientId,
        ...(query.gameType ? { gameType: query.gameType as Prisma.GameSessionWhereInput["gameType"] } : {}),
        ...(query.since ? { playedAt: { gte: new Date(query.since) } } : {}),
      },
      orderBy: { playedAt: "desc" },
      take: query.limit,
    });
    res.json({
      data: sessions.map((s) => ({
        eventId: s.eventId,
        gameType: s.gameType,
        difficulty: s.difficulty,
        accuracy: s.accuracy,
        responseTimeSeconds: s.responseTimeSeconds,
        hintsUsed: s.hintsUsed,
        attempts: s.attempts,
        completed: s.completed,
        abandoned: s.abandoned,
        engagementDurationSeconds: s.engagementDurationSeconds,
        playedAt: s.playedAt.toISOString(),
        detail: s.detail,
      })),
      requestId: req.requestId,
    });
  }),
);

gamesRouter.get(
  "/patients/:patientId/trends",
  requireUserOrDevice,
  requirePatientAccess(),
  validate(trendsQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { period } = req.query as unknown as { period: "7d" | "30d" };
    const trends = await analyseTrends(req.params.patientId, period);
    await writeAudit(req, {
      action: "TRENDS_VIEWED",
      resource: "Observation",
      patientId: req.params.patientId,
      metadata: { period, status: trends.status },
    });
    res.json({ data: trends, requestId: req.requestId });
  }),
);

/** The latest AI session plan(s): what the next activity should look like. */
gamesRouter.get(
  "/patients/:patientId/session-plan",
  requireUserOrDevice,
  requirePatientAccess(),
  validate(sessionPlanQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const { gameType } = req.query as unknown as {
      gameType?: import("@smritisetu/shared-types").PlanGameType;
    };
    const plans = await getSessionPlans(req.params.patientId, gameType);
    res.json({ data: gameType ? (plans[0] ?? null) : plans, requestId: req.requestId });
  }),
);

/** Difficulty profiles with the stored explanation for each decision. */
gamesRouter.get(
  "/patients/:patientId/difficulty-profiles",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const profiles = await prisma.difficultyProfile.findMany({
      where: { patientId: req.params.patientId },
      orderBy: { gameType: "asc" },
    });
    res.json({ data: profiles, requestId: req.requestId });
  }),
);

/** Full, auditable history of every adaptation decision. */
gamesRouter.get(
  "/patients/:patientId/adaptation-history",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const history = await prisma.adaptationDecision.findMany({
      where: { patientId: req.params.patientId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json({ data: history, requestId: req.requestId });
  }),
);
