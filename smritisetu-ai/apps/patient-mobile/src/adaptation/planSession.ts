/**
 * On-device twin of services/ml-service/app/personalisation/planner.py
 * (rules only — the phone never calls Gemini).
 *
 * The deterministic difficulty engine sets the ceiling and hint floor; this
 * builds the full plan inside those bounds, comfort first: an eligible step up
 * is withheld whenever the signals show fatigue, repeated difficulty, recent
 * abandonment or an unusual session. An eight-card game becomes a four-card
 * game, with a longer look, familiar content, a spoken hint and a calm
 * follow-up. Difficulty still moves at most one level.
 */
import {
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  SESSION_PLAN_ITEM_BOUNDS,
  SESSION_PLAN_PREVIEW_BOUNDS,
  SESSION_PLAN_QUESTION_BOUNDS,
  type GameType,
  type SessionPlan,
} from "@smritisetu/shared-types";
import { clampHintLevel, clampStep, isSafeText } from "./safety";
import { recommendEngagement, recommendNextLevel } from "./recommend";
import { deriveSignals } from "./signals";
import type { AdaptationSession } from "./types";

const CALM_GAME_TYPE: GameType = "MEMORY_LANE";

const SUPPORT_REASON_CODES = new Set([
  "ABANDONMENT_SUPPORT",
  "ACCURACY_BELOW_THRESHOLD",
  "AT_MINIMUM_ADDED_SUPPORT",
  "HINT_SUPPORT_INCREASED",
  "HOLD_UNUSUAL_RECENT_SESSION",
]);

const FALLBACK_EXPLANATION =
  "The next round keeps the current level with familiar pacing and support kept comfortable.";

function bounds(map: Record<string, readonly [number, number]>, gameType: string): readonly [number, number] {
  return map[gameType] ?? [0, 0];
}

function clampInt(value: number, low: number, high: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : low;
  return Math.max(low, Math.min(high, n));
}

function defaultCounts(gameType: string, difficulty: number): [number, number, number] {
  const [previewMin, previewMax] = SESSION_PLAN_PREVIEW_BOUNDS;
  if (gameType === "MEMORY_MATCH") {
    const items = clampInt(2 + 2 * difficulty, ...bounds(SESSION_PLAN_ITEM_BOUNDS, "MEMORY_MATCH"));
    return [
      items,
      clampInt(Math.floor(items / 2), ...bounds(SESSION_PLAN_QUESTION_BOUNDS, "MEMORY_MATCH")),
      clampInt(12 - 2 * difficulty, previewMin, previewMax),
    ];
  }
  if (gameType === "MARKET_MEMORY") {
    const items = clampInt(2 + difficulty, ...bounds(SESSION_PLAN_ITEM_BOUNDS, "MARKET_MEMORY"));
    return [items, items, clampInt(10 - 2 * difficulty, previewMin, previewMax)];
  }
  if (gameType === "WHO_IS_THIS") {
    return [
      clampInt(1 + difficulty, ...bounds(SESSION_PLAN_ITEM_BOUNDS, "WHO_IS_THIS")),
      clampInt(1 + difficulty, ...bounds(SESSION_PLAN_QUESTION_BOUNDS, "WHO_IS_THIS")),
      0,
    ];
  }
  if (gameType === "ROUTINE_BUILDER") {
    return [clampInt(2 + difficulty, ...bounds(SESSION_PLAN_ITEM_BOUNDS, "ROUTINE_BUILDER")), 1, 0];
  }
  return [0, 1, 0];
}

export type PlanSessionInput = {
  patientId: string;
  gameType: GameType;
  currentDifficulty: number;
  sessions: AdaptationSession[];
  now?: number;
};

function calmPlan(input: PlanSessionInput, bestTimeOfDay: SessionPlan["bestTimeOfDay"], fatigue: boolean, signals: SessionPlan["signals"]): SessionPlan {
  return {
    patientId: input.patientId,
    gameType: CALM_GAME_TYPE,
    recommendedGameType: CALM_GAME_TYPE,
    difficulty: clampStep(input.currentDifficulty, input.currentDifficulty),
    itemCount: 0,
    questionCount: 1,
    previewSeconds: 0,
    hintLevel: 1,
    hintModality: "BOTH",
    sessionLength: fatigue ? "SHORT" : "STANDARD",
    endWithCalmActivity: false,
    contentPreference: "FAMILIAR",
    bestTimeOfDay,
    comfortFirst: true,
    reasonCode: "UNSCORED_CALM_ACTIVITY",
    explanation:
      "Memory Lane is a calm reminiscence activity and is not scored, so it stays gentle and unhurried.",
    confidence: 0.6,
    source: "baseline",
    signals,
    modelVersion: "on-device-personalisation-1.0.0",
    isDiagnosis: false,
    updatedAt: new Date(input.now ?? Date.now()).toISOString(),
  };
}

function ruleExplanation(reasonCode: string, difficulty: number, items: number, scoredCount: number): string {
  switch (reasonCode) {
    case "LIMITED_HISTORY":
      return `Only ${scoredCount} scored activities have been recorded so far, so the next round stays close to the current level with extra time and support.`;
    case "SHORTENED_FOR_FATIGUE":
      return "There have already been several activities recently, so the next one is shorter and gentler, with familiar pictures and a spoken hint, and ends with a calm activity.";
    case "GENTLER_SET":
      return `Recent activities have been effortful, so the next round has fewer items (${items}), more time to look, familiar family and household pictures and a spoken hint, and finishes with a calm activity to end on a good note.`;
    case "STEP_UP_READY":
      return `Recent rounds have gone smoothly and comfortably, so the next round steps up gently to level ${difficulty}.`;
    default:
      return "Recent rounds sit comfortably, so the next round keeps the current level with familiar pacing and a spoken hint available.";
  }
}

export function planSession(input: PlanSessionInput): SessionPlan {
  const now = input.now ?? Date.now();
  const sig = deriveSignals(input.sessions, now);
  const nowIso = new Date(now).toISOString();

  if (input.gameType === CALM_GAME_TYPE) {
    return calmPlan(input, sig.bestTimeOfDay, sig.fatigueLikely, sig);
  }

  const current = clampStep(input.currentDifficulty, input.currentDifficulty);
  const baseline = recommendNextLevel({
    gameType: input.gameType,
    currentDifficulty: current,
    sessions: input.sessions,
  });

  const concerning =
    sig.fatigueLikely ||
    sig.repeatedDifficulty ||
    (sig.abandonedRecentRate !== null && sig.abandonedRecentRate >= 0.3) ||
    SUPPORT_REASON_CODES.has(baseline.reasonCode);

  let difficulty = clampStep(current, baseline.recommendedDifficulty);
  let stepUpWithheld = false;
  if (concerning && difficulty > current) {
    difficulty = current;
    stepUpWithheld = true;
  }

  const hintFloor = clampHintLevel(baseline.hintLevel);
  let [items, questions, preview] = defaultCounts(input.gameType, difficulty);
  let hintLevel = hintFloor;
  let hintModality: SessionPlan["hintModality"] = "VISUAL";
  let sessionLength: SessionPlan["sessionLength"] = "STANDARD";
  let contentPreference: SessionPlan["contentPreference"] = "STANDARD";
  let endWithCalm = false;

  const [itemLow] = bounds(SESSION_PLAN_ITEM_BOUNDS, input.gameType);
  const [qLow] = bounds(SESSION_PLAN_QUESTION_BOUNDS, input.gameType);
  const [previewMin, previewMax] = SESSION_PLAN_PREVIEW_BOUNDS;

  if (concerning) {
    items =
      sig.repeatedDifficulty || sig.fatigueLikely ? itemLow : clampInt(items - 2, itemLow, items);
    questions = clampInt(questions - 1, qLow, questions);
    if (input.gameType === "MEMORY_MATCH" || input.gameType === "MARKET_MEMORY") {
      preview = clampInt(preview + 3, previewMin, previewMax);
    }
    hintLevel = clampHintLevel(hintFloor + 1);
    hintModality = "BOTH";
    contentPreference = "FAMILIAR";
    endWithCalm = true;
  }

  if (sig.fatigueLikely) {
    sessionLength = "SHORT";
    questions = qLow;
  }
  if (sig.familiarContentRecommended) contentPreference = "FAMILIAR";

  if (input.gameType === "MEMORY_MATCH" && questions * 2 < items) {
    items = clampInt(questions * 2, ...bounds(SESSION_PLAN_ITEM_BOUNDS, "MEMORY_MATCH"));
  }

  const comfortFirst = concerning || stepUpWithheld;

  let reasonCode: string;
  if (!SESSION_PLAN_ITEM_BOUNDS[input.gameType]) reasonCode = "UNSUPPORTED_ACTIVITY";
  else if (sig.scoredSessionCount < 3) reasonCode = "LIMITED_HISTORY";
  else if (sig.fatigueLikely) reasonCode = "SHORTENED_FOR_FATIGUE";
  else if (concerning) reasonCode = "GENTLER_SET";
  else if (difficulty > current) reasonCode = "STEP_UP_READY";
  else reasonCode = "STEADY_PLAN";

  let explanation = ruleExplanation(reasonCode, difficulty, items, sig.scoredSessionCount);
  if (!isSafeText(explanation)) explanation = FALLBACK_EXPLANATION;

  let confidence = 0.55;
  if (sig.scoredSessionCount < 3) confidence = 0.4;
  else if (comfortFirst) confidence = 0.7;
  else if (difficulty !== current) confidence = 0.75;

  const engagement = recommendEngagement(input.sessions);
  const recommendedGameType = engagement.recommendedGameType ?? input.gameType;

  return {
    patientId: input.patientId,
    gameType: input.gameType,
    recommendedGameType,
    difficulty: Math.max(MIN_DIFFICULTY, Math.min(MAX_DIFFICULTY, difficulty)),
    itemCount: items,
    questionCount: questions,
    previewSeconds: preview,
    hintLevel: clampHintLevel(hintLevel),
    hintModality,
    sessionLength,
    endWithCalmActivity: endWithCalm,
    contentPreference,
    bestTimeOfDay: sig.bestTimeOfDay,
    comfortFirst,
    reasonCode,
    explanation,
    confidence: Number(confidence.toFixed(2)),
    source: "baseline",
    signals: sig,
    modelVersion: "on-device-personalisation-1.0.0",
    isDiagnosis: false,
    updatedAt: nowIso,
  };
}
