import type { GameType } from "@smritisetu/shared-types";
import { detectAnomaly } from "./anomaly";
import { recommendDifficulty } from "./engine";
import { recommendEngagement } from "./engagement";
import type { AdaptationDecision, AdaptationSession } from "./types";

/**
 * Rules decide. The anomaly check may only hold an increase when the newest
 * session looks unlike this patient's usual pattern.
 */
export function recommendNextLevel(input: {
  gameType: GameType | string;
  currentDifficulty: number;
  sessions: AdaptationSession[];
}): AdaptationDecision {
  const decision = recommendDifficulty(input);
  const signal = detectAnomaly(input.sessions);

  if (
    signal.available &&
    signal.isUnusual &&
    decision.recommendedDifficulty > input.currentDifficulty
  ) {
    return {
      ...decision,
      recommendedDifficulty: input.currentDifficulty,
      reasonCode: "HOLD_UNUSUAL_RECENT_SESSION",
      explanation:
        "Results were strong enough to move up a level, but the most recent session looked different from this patient's usual pattern, so the current level continues for now.",
      confidence: Math.round(decision.confidence * 0.8 * 100) / 100,
      modelVersion: `${decision.modelVersion}+${signal.modelVersion}`,
    };
  }

  return decision;
}

export { recommendEngagement };
