import type { GameType } from "@smritisetu/shared-types";
import { ADAPTATION, ENGAGEMENT_ENGINE_VERSION } from "./thresholds";
import type { AdaptationSession, EngagementDecision } from "./types";

const ALL_ACTIVITIES: GameType[] = ["MEMORY_MATCH", "WHO_IS_THIS", "ROUTINE_BUILDER", "MEMORY_LANE"];
const CALM_ACTIVITY: GameType = "MEMORY_LANE";
const RECOGNITION_ACTIVITY: GameType = "WHO_IS_THIS";

export function recommendEngagement(sessions: AdaptationSession[]): EngagementDecision {
  const ordered = [...sessions].sort((a, b) =>
    a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0,
  );

  if (ordered.length === 0) {
    return {
      recommendedGameType: "MEMORY_MATCH",
      reasonCode: "NO_HISTORY",
      explanation:
        "No activities have been recorded yet, so a gentle picture-matching activity is offered first.",
      modelVersion: ENGAGEMENT_ENGINE_VERSION,
    };
  }

  const recent = ordered.slice(0, ADAPTATION.abandonmentWindow);
  const abandoned = recent.filter((session) => session.abandoned).length;
  if (abandoned >= ADAPTATION.abandonmentThreshold) {
    return {
      recommendedGameType: CALM_ACTIVITY,
      reasonCode: "RECENT_ABANDONMENT",
      explanation: `${abandoned} of the last ${recent.length} activities were left before finishing, so a calm reminiscence activity with no score is offered next.`,
      modelVersion: ENGAGEMENT_ENGINE_VERSION,
    };
  }

  const effortful = recent.filter((session) => session.accuracy !== null && session.accuracy < 0.5);
  if (effortful.length >= 2) {
    return {
      recommendedGameType: RECOGNITION_ACTIVITY,
      reasonCode: "OFFER_RECOGNITION_ACTIVITY",
      explanation: "Recent activities have been effortful, so a familiar-faces activity is offered next.",
      modelVersion: ENGAGEMENT_ENGINE_VERSION,
    };
  }

  const played = new Map<string, number>();
  for (const session of ordered.slice(0, 10)) {
    played.set(session.gameType, (played.get(session.gameType) ?? 0) + 1);
  }

  let leastPlayed = ALL_ACTIVITIES.reduce((best, game) => {
    const bestCount = played.get(best) ?? 0;
    const nextCount = played.get(game) ?? 0;
    if (nextCount < bestCount) return game;
    if (nextCount === bestCount && ALL_ACTIVITIES.indexOf(game) < ALL_ACTIVITIES.indexOf(best)) {
      return game;
    }
    return best;
  });

  const lastPlayed = ordered[0];
  if (lastPlayed && lastPlayed.gameType === leastPlayed && ordered.length > 1) {
    const alternatives = ALL_ACTIVITIES.filter((game) => game !== leastPlayed);
    leastPlayed = alternatives.reduce((best, game) =>
      (played.get(game) ?? 0) < (played.get(best) ?? 0) ? game : best,
    );
  }

  return {
    recommendedGameType: leastPlayed,
    reasonCode: "VARIETY_ROTATION",
    explanation: "Things are going steadily, so a different activity is offered to keep the day varied.",
    modelVersion: ENGAGEMENT_ENGINE_VERSION,
  };
}
