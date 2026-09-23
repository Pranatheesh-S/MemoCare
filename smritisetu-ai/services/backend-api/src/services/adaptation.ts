import type { GameType as PrismaGameType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { MAX_DIFFICULTY, MIN_DIFFICULTY } from "@smritisetu/shared-types";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { mlClient, type MlSessionMetric } from "../lib/mlClient";

export const FALLBACK_MODEL_VERSION = "backend-fallback-1.0.0";

/**
 * Asks the ML service for a difficulty recommendation and persists it.
 *
 * If the ML service is unavailable the patient's current difficulty is kept
 * unchanged and a queued marker is stored, so the evaluation can be retried on
 * the next sync. Nothing about this path is visible to the patient.
 */
export async function evaluateAdaptation(
  patientId: string,
  gameType: PrismaGameType,
): Promise<{ applied: boolean; difficulty: number; reasonCode: string; explanation: string }> {
  const profile = await ensureDifficultyProfile(patientId, gameType);

  // Memory Lane is unscored — its difficulty never moves.
  if (gameType === "MEMORY_LANE") {
    return {
      applied: false,
      difficulty: profile.currentDifficulty,
      reasonCode: "UNSCORED_ACTIVITY",
      explanation: "Memory Lane is a calm reminiscence activity and is not scored.",
    };
  }

  const sessions = await prisma.gameSession.findMany({
    where: { patientId, gameType },
    orderBy: { playedAt: "desc" },
    take: 20,
  });

  const metrics: MlSessionMetric[] = sessions.map((s) => ({
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

  const recommendation = await mlClient.recommendDifficulty({
    patient_id: patientId,
    game_type: gameType,
    current_difficulty: profile.currentDifficulty,
    sessions: metrics,
  });

  if (!recommendation) {
    logger.info("ML unavailable — keeping current difficulty", { patientId, gameType });
    await prisma.difficultyProfile.update({
      where: { id: profile.id },
      data: { reasonCode: "ML_UNAVAILABLE_EVALUATION_QUEUED", modelVersion: FALLBACK_MODEL_VERSION },
    });
    return {
      applied: false,
      difficulty: profile.currentDifficulty,
      reasonCode: "ML_UNAVAILABLE_EVALUATION_QUEUED",
      explanation: "Keeping the current level. The recommendation will be reviewed again later.",
    };
  }

  // Defence in depth: the backend re-applies the safety limits (range, and no
  // jump larger than one level) even though the ML service already enforces
  // them. A model change must never be able to move a patient two levels.
  const clamped = clampStep(profile.currentDifficulty, recommendation.recommended_difficulty);

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.difficultyProfile.update({
      where: { id: profile.id },
      data: {
        currentDifficulty: clamped,
        hintLevel: Math.max(1, Math.min(3, recommendation.hint_level)),
        reasonCode: recommendation.reason_code,
        explanation: recommendation.explanation,
        modelVersion: recommendation.model_version,
        evidenceSessionCount: recommendation.evidence_session_count,
      },
    });
    await tx.adaptationDecision.create({
      data: {
        difficultyProfileId: profile.id,
        patientId,
        gameType,
        previousDifficulty: profile.currentDifficulty,
        recommendedDifficulty: clamped,
        hintLevel: next.hintLevel,
        reasonCode: recommendation.reason_code,
        explanation: recommendation.explanation,
        confidence: recommendation.confidence,
        evidenceSessionCount: recommendation.evidence_session_count,
        evidence: { sessions: metrics.slice(0, 10), rawRecommendation: recommendation } as Prisma.InputJsonValue,
        modelVersion: recommendation.model_version,
      },
    });
    return next;
  });

  logger.info("Difficulty recommendation stored", {
    patientId,
    gameType,
    from: profile.currentDifficulty,
    to: updated.currentDifficulty,
    reasonCode: recommendation.reason_code,
  });

  return {
    applied: updated.currentDifficulty !== profile.currentDifficulty,
    difficulty: updated.currentDifficulty,
    reasonCode: recommendation.reason_code,
    explanation: recommendation.explanation,
  };
}

export function clampStep(current: number, proposed: number): number {
  const bounded = Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, Math.round(proposed)));
  if (bounded > current + 1) return current + 1;
  if (bounded < current - 1) return current - 1;
  return bounded;
}

export async function ensureDifficultyProfile(patientId: string, gameType: PrismaGameType) {
  const existing = await prisma.difficultyProfile.findUnique({
    where: { patientId_gameType: { patientId, gameType } },
  });
  if (existing) return existing;
  return prisma.difficultyProfile.create({
    data: { patientId, gameType, currentDifficulty: 1, hintLevel: 1 },
  });
}
