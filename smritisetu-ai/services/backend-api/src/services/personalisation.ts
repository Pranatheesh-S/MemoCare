import type { GameType as PrismaGameType, SessionPlan as PrismaSessionPlan } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  SESSION_PLAN_ITEM_BOUNDS,
  SESSION_PLAN_PREVIEW_BOUNDS,
  SESSION_PLAN_QUESTION_BOUNDS,
  type ContentPreference,
  type HintModality,
  type SessionLength,
  type SessionPlan,
  type TimeOfDayPreference,
} from "@smritisetu/shared-types";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { mlClient, type MlSessionMetric, type MlSessionPlanResponse } from "../lib/mlClient";
import { clampStep, ensureDifficultyProfile } from "./adaptation";

export const PERSONALISATION_FALLBACK_VERSION = "backend-personalisation-fallback-1.0.0";

const PLAN_GAME_TYPES: PrismaGameType[] = [
  "MEMORY_MATCH",
  "ROUTINE_BUILDER",
  "WHO_IS_THIS",
  "MEMORY_LANE",
  "MARKET_MEMORY",
];

const HINT_MODALITIES: HintModality[] = ["VISUAL", "VOICE", "BOTH"];
const SESSION_LENGTHS: SessionLength[] = ["SHORT", "STANDARD"];
const CONTENT_PREFERENCES: ContentPreference[] = ["FAMILIAR", "STANDARD"];
const TIME_OF_DAY: TimeOfDayPreference[] = ["MORNING", "AFTERNOON", "EVENING", "NIGHT", "UNKNOWN"];

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, n));
}

function bounds(map: Record<string, readonly [number, number]>, gameType: string): readonly [number, number] {
  return map[gameType] ?? [0, 0];
}

function oneOf<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return (allowed as string[]).includes(value as string) ? (value as T) : fallback;
}

type PlanWrite = Omit<PrismaSessionPlan, "id" | "createdAt" | "updatedAt" | "signals"> & {
  signals: Prisma.InputJsonValue;
};

/**
 * Re-applies every safety limit the ML service already enforces, so a model
 * change can never move a patient more than one level, exceed the item bounds,
 * or drop hint support below what the rules asked for. Defence in depth.
 */
function sanitise(
  raw: MlSessionPlanResponse,
  input: { patientId: string; gameType: PrismaGameType; currentDifficulty: number; hintFloor: number },
): PlanWrite {
  const gameType = input.gameType;
  const [itemMin, itemMax] = bounds(SESSION_PLAN_ITEM_BOUNDS, gameType);
  const [qMin, qMax] = bounds(SESSION_PLAN_QUESTION_BOUNDS, gameType);
  const [previewMin, previewMax] = SESSION_PLAN_PREVIEW_BOUNDS;

  const difficulty =
    gameType === "MEMORY_LANE"
      ? input.currentDifficulty
      : clampStep(input.currentDifficulty, clampInt(raw.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY));

  const recommendedGameType = PLAN_GAME_TYPES.includes(raw.recommended_game_type as PrismaGameType)
    ? (raw.recommended_game_type as PrismaGameType)
    : gameType;

  return {
    patientId: input.patientId,
    gameType,
    recommendedGameType,
    difficulty,
    itemCount: clampInt(raw.item_count, itemMin, itemMax),
    questionCount: clampInt(raw.question_count, qMin, qMax),
    previewSeconds: clampInt(raw.preview_seconds, previewMin, previewMax),
    // The model may raise hint support but never drop it below the rule floor.
    hintLevel: Math.max(input.hintFloor, clampInt(raw.hint_level, 1, 3)),
    hintModality: oneOf(raw.hint_modality, HINT_MODALITIES, "VISUAL"),
    sessionLength: oneOf(raw.session_length, SESSION_LENGTHS, "STANDARD"),
    endWithCalmActivity: Boolean(raw.end_with_calm_activity),
    contentPreference: oneOf(raw.content_preference, CONTENT_PREFERENCES, "STANDARD"),
    bestTimeOfDay: oneOf(raw.best_time_of_day, TIME_OF_DAY, "UNKNOWN"),
    comfortFirst: Boolean(raw.comfort_first),
    reasonCode: String(raw.reason_code ?? "STEADY_PLAN"),
    explanation: String(raw.explanation ?? "The next round keeps the current level."),
    confidence: Number.isFinite(raw.confidence) ? Math.max(0, Math.min(1, raw.confidence)) : 0,
    source: raw.source === "model" ? "model" : "baseline",
    signals: (raw.signals ?? {}) as Prisma.InputJsonValue,
    modelVersion: String(raw.model_version ?? PERSONALISATION_FALLBACK_VERSION),
  };
}

function baselineFor(
  patientId: string,
  gameType: PrismaGameType,
  difficulty: number,
  hintLevel: number,
): PlanWrite {
  const [itemMin, itemMax] = bounds(SESSION_PLAN_ITEM_BOUNDS, gameType);
  const isCalm = gameType === "MEMORY_LANE";
  const itemCount = isCalm ? 0 : clampInt(2 + 2 * difficulty, itemMin, itemMax);
  return {
    patientId,
    gameType,
    recommendedGameType: gameType,
    difficulty,
    itemCount,
    questionCount: isCalm ? 1 : clampInt(itemCount / 2 || 2, ...bounds(SESSION_PLAN_QUESTION_BOUNDS, gameType)),
    previewSeconds: gameType === "MEMORY_MATCH" ? clampInt(12 - 2 * difficulty, 0, 12) : 0,
    hintLevel: Math.max(1, Math.min(3, hintLevel)),
    hintModality: "VISUAL",
    sessionLength: "STANDARD",
    endWithCalmActivity: false,
    contentPreference: "STANDARD",
    bestTimeOfDay: "UNKNOWN",
    comfortFirst: false,
    reasonCode: isCalm ? "UNSCORED_CALM_ACTIVITY" : "ML_UNAVAILABLE_PLAN_QUEUED",
    explanation: isCalm
      ? "Memory Lane is a calm reminiscence activity and is not scored."
      : "Keeping the current level. The plan will be reviewed again on the next sync.",
    confidence: isCalm ? 0.6 : 0.3,
    source: "baseline",
    signals: {} as Prisma.InputJsonValue,
    modelVersion: PERSONALISATION_FALLBACK_VERSION,
  };
}

function toMetrics(
  sessions: Array<{
    gameType: string;
    difficulty: number;
    accuracy: number | null;
    responseTimeSeconds: number;
    hintsUsed: number;
    attempts: number;
    completed: boolean;
    abandoned: boolean;
    engagementDurationSeconds: number;
    playedAt: Date;
  }>,
): MlSessionMetric[] {
  return sessions.map((s) => ({
    game_type: s.gameType,
    difficulty: s.difficulty,
    accuracy: s.accuracy,
    response_time_seconds: s.responseTimeSeconds,
    hints_used: s.hintsUsed,
    attempts: s.attempts,
    completed: s.completed,
    abandoned: s.abandoned,
    engagement_duration_seconds: s.engagementDurationSeconds,
    played_at: s.playedAt.toISOString(),
  }));
}

/**
 * Builds and stores the AI session plan for one activity, called after each
 * game session next to `evaluateAdaptation`. If the ML service is unavailable
 * an existing plan is left untouched (or a gentle baseline is written), so the
 * games always have something to read and are never blocked by ML.
 */
export async function evaluateSessionPlan(
  patientId: string,
  gameType: PrismaGameType,
): Promise<SessionPlan> {
  const [profile, patient, existing, sessions] = await Promise.all([
    ensureDifficultyProfile(patientId, gameType),
    prisma.patientProfile.findUnique({
      where: { id: patientId },
      select: { preferredLanguage: true, stateId: true },
    }),
    prisma.sessionPlan.findUnique({ where: { patientId_gameType: { patientId, gameType } } }),
    prisma.gameSession.findMany({
      where: { patientId },
      orderBy: { playedAt: "desc" },
      take: 40,
    }),
  ]);

  const locale = patient?.stateId
    ? `${patient.preferredLanguage}-${patient.stateId === "AS" ? "IN" : patient.stateId}`
    : (patient?.preferredLanguage ?? null);

  const recommendation = await mlClient.buildSessionPlan({
    patient_id: patientId,
    game_type: gameType,
    current_difficulty: profile.currentDifficulty,
    enabled_game_types: PLAN_GAME_TYPES,
    sessions: toMetrics(sessions),
    locale,
  });

  const data = recommendation
    ? sanitise(recommendation, {
        patientId,
        gameType,
        currentDifficulty: profile.currentDifficulty,
        hintFloor: profile.hintLevel,
      })
    : (existing
        ? null
        : baselineFor(patientId, gameType, profile.currentDifficulty, profile.hintLevel));

  if (!data) {
    logger.info("ML unavailable — keeping the existing session plan", { patientId, gameType });
    return toDomain(existing as PrismaSessionPlan);
  }

  const stored = await prisma.sessionPlan.upsert({
    where: { patientId_gameType: { patientId, gameType } },
    create: data,
    update: data,
  });

  logger.info("Session plan stored", {
    patientId,
    gameType,
    source: stored.source,
    difficulty: stored.difficulty,
    itemCount: stored.itemCount,
    reasonCode: stored.reasonCode,
  });

  return toDomain(stored);
}

export function toDomain(row: PrismaSessionPlan): SessionPlan {
  return {
    patientId: row.patientId,
    gameType: row.gameType,
    recommendedGameType: row.recommendedGameType,
    difficulty: row.difficulty,
    itemCount: row.itemCount,
    questionCount: row.questionCount,
    previewSeconds: row.previewSeconds,
    hintLevel: row.hintLevel,
    hintModality: row.hintModality as HintModality,
    sessionLength: row.sessionLength as SessionLength,
    endWithCalmActivity: row.endWithCalmActivity,
    contentPreference: row.contentPreference as ContentPreference,
    bestTimeOfDay: row.bestTimeOfDay as TimeOfDayPreference,
    comfortFirst: row.comfortFirst,
    reasonCode: row.reasonCode,
    explanation: row.explanation,
    confidence: row.confidence,
    source: row.source === "model" ? "model" : "baseline",
    signals: (row.signals as SessionPlan["signals"]) ?? undefined,
    modelVersion: row.modelVersion,
    isDiagnosis: false,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSessionPlans(
  patientId: string,
  gameType?: PrismaGameType,
): Promise<SessionPlan[]> {
  const rows = await prisma.sessionPlan.findMany({
    where: { patientId, ...(gameType ? { gameType } : {}) },
    orderBy: { gameType: "asc" },
  });
  return rows.map(toDomain);
}
