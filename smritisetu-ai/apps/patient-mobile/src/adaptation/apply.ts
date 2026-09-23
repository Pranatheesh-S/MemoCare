import type { GameType } from "@smritisetu/shared-types";
import { DifficultyRepository, GameSessionRepository } from "../db/repositories";
import { HINTS_BY_DIFFICULTY, PREVIEW_SECONDS_BY_DIFFICULTY } from "../games/gameContent";
import { useAppStore } from "../store/appStore";
import {
  getAdaptationEngine,
  mapParamsToDecision,
  previewSecondsFromParams,
  toSessionStats,
} from "./AdaptationEngine";
import { detectAnomaly } from "./anomaly";
import { recommendEngagement, recommendNextLevel } from "./recommend";
import { isSafeText } from "./safety";
import type { AdaptationDecision, AdaptationSession } from "./types";

/** Safety rules that the neural net must never override. */
const SAFETY_REASON_CODES = new Set([
  "UNSCORED_ACTIVITY",
  "ABANDONMENT_SUPPORT",
  "ACCURACY_BELOW_THRESHOLD",
  "AT_MINIMUM_ADDED_SUPPORT",
]);

function toMetric(session: {
  gameType: string;
  difficulty: number;
  accuracy: number | null;
  hintsUsed: number;
  completed: boolean;
  abandoned: boolean;
  responseTimeSeconds: number;
  engagementDurationSeconds: number;
  playedAt: string;
}): AdaptationSession {
  return {
    gameType: session.gameType,
    difficulty: session.difficulty,
    accuracy: session.accuracy,
    hintsUsed: session.hintsUsed,
    completed: session.completed,
    abandoned: session.abandoned,
    responseTimeSeconds: session.responseTimeSeconds,
    engagementDurationSeconds: session.engagementDurationSeconds,
    playedAt: session.playedAt,
  };
}

export type AppliedAdaptation = AdaptationDecision & {
  hintsAllowed: number;
  previewSeconds: number;
};

function withSafeExplanation(decision: AdaptationDecision): AdaptationDecision {
  if (isSafeText(decision.explanation)) return decision;
  return {
    ...decision,
    explanation: "The current level continues, with support kept comfortable.",
  };
}

/**
 * Runs the on-device model after a session is stored and writes the next
 * level into SQLite. Failures are silent: the session still counts, and the
 * current level continues.
 *
 * Safety rules (Memory Lane, abandonment, a clear drop in accuracy) win.
 * Otherwise the TFLite network proposes the next parameters, then the same
 * one-step clamp and anomaly hold used by the rule engine still apply.
 */
export async function applyOnDeviceAdaptation(input: {
  patientId: string;
  gameType: GameType;
  currentDifficulty: number;
}): Promise<AppliedAdaptation | null> {
  try {
    const stored = await new GameSessionRepository().listRecent(input.patientId, 40);
    const sessions = stored.map(toMetric);
    const safety = recommendNextLevel({
      gameType: input.gameType,
      currentDifficulty: input.currentDifficulty,
      sessions,
    });

    if (SAFETY_REASON_CODES.has(safety.reasonCode)) {
      return persistDecision(input.patientId, input.gameType, sessions, safety);
    }

    const modelled = await decideWithModel(input, sessions, safety);
    return persistDecision(
      input.patientId,
      input.gameType,
      sessions,
      modelled.decision,
      modelled.previewSeconds,
    );
  } catch {
    return null;
  }
}

async function decideWithModel(
  input: { gameType: GameType; currentDifficulty: number },
  sessions: AdaptationSession[],
  safety: AdaptationDecision,
): Promise<{ decision: AdaptationDecision; previewSeconds?: number }> {
  const engine = getAdaptationEngine();
  await engine.loadModel();

  const sameGame = sessions
    .filter((session) => session.gameType === input.gameType)
    .sort((a, b) => (a.playedAt < b.playedAt ? -1 : a.playedAt > b.playedAt ? 1 : 0));

  const params = await engine.getNextDifficulty(toSessionStats(sameGame));

  // If the network could not load, keep the existing explainable rule decision.
  if (engine.lastSource === "fallback") {
    return { decision: safety };
  }

  const mapped = mapParamsToDecision({
    params,
    source: engine.lastSource,
    currentDifficulty: input.currentDifficulty,
    gameType: input.gameType,
    evidenceSessionCount: Math.min(5, sameGame.length),
  });

  const signal = detectAnomaly(sessions);
  if (
    signal.available &&
    signal.isUnusual &&
    mapped.recommendedDifficulty > input.currentDifficulty
  ) {
    return {
      decision: withSafeExplanation({
        ...mapped,
        recommendedDifficulty: input.currentDifficulty,
        reasonCode: "HOLD_UNUSUAL_RECENT_SESSION",
        explanation:
          "Results were strong enough to move up a level, but the most recent session looked different from this patient's usual pattern, so the current level continues for now.",
        confidence: Math.round(mapped.confidence * 0.8 * 100) / 100,
        modelVersion: `${mapped.modelVersion}+${signal.modelVersion}`,
      }),
      previewSeconds: previewSecondsFromParams(params, input.currentDifficulty),
    };
  }

  return {
    decision: withSafeExplanation(mapped),
    previewSeconds: previewSecondsFromParams(params, mapped.recommendedDifficulty),
  };
}

async function persistDecision(
  patientId: string,
  gameType: GameType,
  sessions: AdaptationSession[],
  decision: AdaptationDecision,
  previewSeconds = PREVIEW_SECONDS_BY_DIFFICULTY[decision.recommendedDifficulty] ?? 6,
): Promise<AppliedAdaptation> {
  const hintsAllowed = Math.max(
    HINTS_BY_DIFFICULTY[decision.recommendedDifficulty] ?? 2,
    decision.hintLevel,
  );

  await new DifficultyRepository().upsert({
    patientId,
    gameType,
    currentDifficulty: decision.recommendedDifficulty,
    hintLevel: decision.hintLevel,
    previewSeconds,
    reasonCode: decision.reasonCode,
    explanation: decision.explanation,
  });

  const engagement = recommendEngagement(sessions);
  useAppStore.getState().setRecommendation(engagement.recommendedGameType, engagement.explanation);

  return { ...decision, hintsAllowed, previewSeconds };
}
