import type { ObservationStatus, TrendsResponse } from "@smritisetu/shared-types";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { mlClient, type MlSessionMetric } from "../lib/mlClient";
import { evaluateTrendObservation } from "./alertEngine";
import { logger } from "../lib/logger";

const LOCAL_FALLBACK_VERSION = "backend-trends-fallback-1.0.0";

/**
 * Rolling 7-day / 30-day trend analysis.
 *
 * The heavy lifting lives in the ML service. If it is unreachable the backend
 * returns a conservative INSUFFICIENT_DATA result rather than inventing a
 * conclusion — a support tool must never guess about someone's condition.
 */
export async function analyseTrends(
  patientId: string,
  period: "7d" | "30d",
  options: { persistObservation?: boolean } = {},
): Promise<TrendsResponse> {
  const days = period === "7d" ? 7 : 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // A baseline of the same length immediately before the window.
  const baselineSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

  const [sessions, acknowledged, missed] = await Promise.all([
    prisma.gameSession.findMany({
      where: { patientId, playedAt: { gte: baselineSince } },
      orderBy: { playedAt: "desc" },
      take: 500,
    }),
    prisma.reminderEvent.count({
      where: { patientId, state: "ACKNOWLEDGED", dueAt: { gte: since } },
    }),
    prisma.reminderEvent.count({ where: { patientId, state: "MISSED", dueAt: { gte: since } } }),
  ]);

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

  const analysis = await mlClient.analyseTrends({
    patient_id: patientId,
    period,
    sessions: metrics,
    reminder_adherence: { acknowledged, missed },
  });

  const generatedAt = new Date().toISOString();

  if (!analysis) {
    logger.warn("Trend analysis unavailable — ML service not reachable", { patientId, period });
    return {
      patientId,
      period,
      status: "INSUFFICIENT_DATA" as ObservationStatus,
      reasonCode: "ANALYSIS_UNAVAILABLE",
      explanation:
        "Trend analysis is not available right now. Recorded activity is safe and will be analysed once the service is reachable.",
      isDiagnosis: false,
      indicators: [],
      sessionCount: sessions.filter((s) => s.playedAt >= since).length,
      modelVersion: LOCAL_FALLBACK_VERSION,
      generatedAt,
    };
  }

  const response: TrendsResponse = {
    patientId,
    period,
    status: analysis.status,
    reasonCode: analysis.reason_code,
    explanation: analysis.explanation,
    isDiagnosis: false,
    indicators: analysis.indicators.map((i) => ({
      name: i.name,
      current: i.current,
      baseline: i.baseline,
      direction: i.direction,
      sampleSize: i.sample_size,
    })),
    sessionCount: analysis.session_count,
    modelVersion: analysis.model_version,
    generatedAt,
  };

  if (options.persistObservation !== false) {
    await prisma.observation.create({
      data: {
        patientId,
        period,
        status: analysis.status,
        reasonCode: analysis.reason_code,
        explanation: analysis.explanation,
        isDiagnosis: false,
        indicators: analysis.indicators as unknown as Prisma.InputJsonValue,
        modelVersion: analysis.model_version,
      },
    });

    await evaluateTrendObservation(patientId, {
      status: analysis.status,
      reasonCode: analysis.reason_code,
      explanation: analysis.explanation,
      indicators: analysis.indicators,
      modelVersion: analysis.model_version,
      period,
      sessionCount: analysis.session_count,
    });
  }

  return response;
}
