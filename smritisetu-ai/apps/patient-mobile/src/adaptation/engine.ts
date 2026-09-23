/**
 * Deterministic, explainable difficulty adaptation.
 *
 * Twin of services/ml-service/app/rules/adaptation.py so the phone can adapt
 * with no network. First matching rule wins. Never a clinical judgement.
 *
 *  1. repeated abandonment        -> offer a calmer activity, do not raise
 *  2. accuracy is too low         -> reduce difficulty by one
 *  3. hints are consistently high -> keep difficulty, increase hint support
 *  4. accuracy is consistently high -> increase difficulty by one
 *  5. otherwise                   -> maintain
 */
import type { GameType } from "@smritisetu/shared-types";
import { clampHintLevel, clampStep, median, percentLabel } from "./safety";
import { ADAPTATION, RULE_ENGINE_VERSION } from "./thresholds";
import type { AdaptationDecision, AdaptationSession } from "./types";

const CALM_ACTIVITY: GameType = "MEMORY_LANE";

function comparable(
  sessions: AdaptationSession[],
  gameType: string,
  difficulty: number,
): AdaptationSession[] {
  return sessions
    .filter((session) => session.gameType === gameType && session.difficulty === difficulty)
    .sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0));
}

function completed(sessions: AdaptationSession[]): AdaptationSession[] {
  return sessions.filter((session) => session.completed && !session.abandoned && session.accuracy !== null);
}

function recentAbandoned(sessions: AdaptationSession[], gameType: string): number {
  const same = sessions
    .filter((session) => session.gameType === gameType)
    .sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0))
    .slice(0, ADAPTATION.abandonmentWindow);
  return same.filter((session) => session.abandoned).length;
}

function medianAccuracy(sessions: AdaptationSession[]): number | null {
  return median(sessions.map((session) => session.accuracy).filter((value): value is number => value !== null));
}

function suggestHintLevel(sessions: AdaptationSession[]): number {
  if (sessions.length === 0) return 1;
  const medianHints = median(sessions.slice(0, 5).map((session) => session.hintsUsed)) ?? 0;
  if (medianHints >= ADAPTATION.hintThreshold) return 3;
  if (medianHints >= 1) return 2;
  return 1;
}

function decision(
  partial: Omit<AdaptationDecision, "modelVersion" | "isDiagnosis">,
): AdaptationDecision {
  return { ...partial, modelVersion: RULE_ENGINE_VERSION, isDiagnosis: false };
}

export function decideDifficulty(input: {
  gameType: GameType | string;
  currentDifficulty: number;
  sessions: AdaptationSession[];
}): AdaptationDecision {
  const gameType = input.gameType as GameType;
  const current = clampStep(input.currentDifficulty, input.currentDifficulty);

  if (gameType === "MEMORY_LANE") {
    return decision({
      recommendedDifficulty: current,
      hintLevel: 1,
      recommendedGameType: gameType,
      reasonCode: "UNSCORED_ACTIVITY",
      explanation:
        "Memory Lane is a calm reminiscence activity and is not scored, so its level stays the same.",
      confidence: 1,
      evidenceSessionCount: 0,
    });
  }

  const alike = comparable(input.sessions, gameType, current);
  const finished = completed(alike);

  const abandonedCount = recentAbandoned(input.sessions, gameType);
  if (abandonedCount >= ADAPTATION.abandonmentThreshold) {
    const windowSize = Math.min(ADAPTATION.abandonmentWindow, input.sessions.length);
    return decision({
      recommendedDifficulty: current,
      hintLevel: clampHintLevel(ADAPTATION.maxHintLevel),
      recommendedGameType: CALM_ACTIVITY,
      reasonCode: "ABANDONMENT_SUPPORT",
      explanation: `${abandonedCount} of the last ${windowSize} activities were left before finishing, so the level stays the same and a calmer recognition activity is offered next.`,
      confidence: 0.75,
      evidenceSessionCount: abandonedCount,
    });
  }

  if (finished.length < ADAPTATION.decreaseMinSessions) {
    return decision({
      recommendedDifficulty: current,
      hintLevel: clampHintLevel(suggestHintLevel(alike)),
      recommendedGameType: gameType,
      reasonCode: "INSUFFICIENT_EVIDENCE",
      explanation: `Only ${finished.length} comparable finished session(s) are available, which is not enough to change the level. The current level continues.`,
      confidence: 0.4,
      evidenceSessionCount: finished.length,
    });
  }

  const decreaseWindow = finished.slice(0, ADAPTATION.decreaseMinSessions);
  if (
    decreaseWindow.length >= ADAPTATION.decreaseMinSessions &&
    decreaseWindow.every((session) => (session.accuracy ?? 0) < ADAPTATION.decreaseAccuracy)
  ) {
    const mid = medianAccuracy(decreaseWindow) ?? 0;
    const target = clampStep(current, current - 1);
    if (target === current) {
      return decision({
        recommendedDifficulty: current,
        hintLevel: clampHintLevel(ADAPTATION.maxHintLevel),
        recommendedGameType: CALM_ACTIVITY,
        reasonCode: "AT_MINIMUM_ADDED_SUPPORT",
        explanation:
          "The activity is already at its gentlest level, so more hint support is offered and a calmer activity is suggested next.",
        confidence: 0.7,
        evidenceSessionCount: decreaseWindow.length,
      });
    }
    return decision({
      recommendedDifficulty: target,
      hintLevel: clampHintLevel(suggestHintLevel(alike) + 1),
      recommendedGameType: gameType,
      reasonCode: "ACCURACY_BELOW_THRESHOLD",
      explanation: `The last ${decreaseWindow.length} comparable sessions were around ${percentLabel(mid)}, below the ${percentLabel(ADAPTATION.decreaseAccuracy)} comfort threshold, so the level moves down to ${target} with more support.`,
      confidence: 0.8,
      evidenceSessionCount: decreaseWindow.length,
    });
  }

  const hintWindow = alike.slice(0, ADAPTATION.hintMinSessions);
  if (hintWindow.length >= ADAPTATION.hintMinSessions) {
    const medianHints = median(hintWindow.map((session) => session.hintsUsed)) ?? 0;
    if (medianHints > ADAPTATION.hintThreshold) {
      return decision({
        recommendedDifficulty: current,
        hintLevel: clampHintLevel(suggestHintLevel(alike) + 1),
        recommendedGameType: gameType,
        reasonCode: "HINT_SUPPORT_INCREASED",
        explanation: `Hints were used ${Math.round(medianHints)} times on average across the last ${hintWindow.length} comparable sessions, so the level stays the same and more hint support is offered.`,
        confidence: 0.7,
        evidenceSessionCount: hintWindow.length,
      });
    }
  }

  const increaseWindow = finished.slice(0, ADAPTATION.increaseMinSessions);
  if (
    increaseWindow.length >= ADAPTATION.increaseMinSessions &&
    increaseWindow.every((session) => (session.accuracy ?? 0) >= ADAPTATION.increaseAccuracy)
  ) {
    const mid = medianAccuracy(increaseWindow) ?? 0;
    const target = clampStep(current, current + 1);
    if (target === current) {
      return decision({
        recommendedDifficulty: current,
        hintLevel: clampHintLevel(suggestHintLevel(alike)),
        recommendedGameType: gameType,
        reasonCode: "AT_MAXIMUM_MAINTAINED",
        explanation:
          "The activity is already at its most challenging level, and it is going well, so the level stays the same.",
        confidence: 0.75,
        evidenceSessionCount: increaseWindow.length,
      });
    }
    return decision({
      recommendedDifficulty: target,
      hintLevel: clampHintLevel(Math.max(1, suggestHintLevel(alike))),
      recommendedGameType: gameType,
      reasonCode: "ACCURACY_ABOVE_THRESHOLD",
      explanation: `The last ${increaseWindow.length} comparable sessions were around ${percentLabel(mid)}, at or above the ${percentLabel(ADAPTATION.increaseAccuracy)} threshold, so the level moves up gently to ${target}.`,
      confidence: 0.85,
      evidenceSessionCount: increaseWindow.length,
    });
  }

  const mid = medianAccuracy(finished);
  return decision({
    recommendedDifficulty: current,
    hintLevel: clampHintLevel(suggestHintLevel(alike)),
    recommendedGameType: gameType,
    reasonCode: "MAINTAIN_CURRENT_LEVEL",
    explanation:
      "Recent sessions sit comfortably between the thresholds" +
      (mid !== null ? ` (around ${percentLabel(mid)})` : "") +
      ", so the current level continues.",
    confidence: 0.65,
    evidenceSessionCount: finished.length,
  });
}

export function recommendDifficulty(input: {
  gameType: GameType | string;
  currentDifficulty: number;
  sessions: AdaptationSession[];
}): AdaptationDecision {
  const decided = decideDifficulty(input);
  return {
    ...decided,
    recommendedDifficulty: clampStep(input.currentDifficulty, decided.recommendedDifficulty),
    hintLevel: clampHintLevel(decided.hintLevel),
  };
}
