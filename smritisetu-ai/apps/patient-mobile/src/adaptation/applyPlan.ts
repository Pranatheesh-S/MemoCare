/**
 * Persists an AI session plan on the device.
 *
 * After each stored session `applyOnDeviceSessionPlan` recomputes a rules-only
 * plan (the offline twin of the server's) and writes it to SQLite so the games
 * can read it with no network. When the backend returns a plan — which may be
 * Gemini-refined — `storeServerSessionPlan` overwrites the local one.
 *
 * Failures are silent: the games fall back to the difficulty profile.
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
import { GameSessionRepository, SessionPlanRepository } from "../db/repositories";
import { clampHintLevel, clampStep } from "./safety";
import { planSession } from "./planSession";
import type { AdaptationSession } from "./types";

function clampInt(value: number, low: number, high: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : low;
  return Math.max(low, Math.min(high, n));
}

function toSession(row: {
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
    gameType: row.gameType,
    difficulty: row.difficulty,
    accuracy: row.accuracy,
    hintsUsed: row.hintsUsed,
    completed: row.completed,
    abandoned: row.abandoned,
    responseTimeSeconds: row.responseTimeSeconds,
    engagementDurationSeconds: row.engagementDurationSeconds,
    playedAt: row.playedAt,
  };
}

export async function applyOnDeviceSessionPlan(input: {
  patientId: string;
  gameType: GameType;
  currentDifficulty: number;
}): Promise<SessionPlan | null> {
  try {
    const stored = await new GameSessionRepository().listRecent(input.patientId, 40);
    const plan = planSession({
      patientId: input.patientId,
      gameType: input.gameType,
      currentDifficulty: input.currentDifficulty,
      sessions: stored.map(toSession),
    });
    await new SessionPlanRepository().upsert(plan);
    return plan;
  } catch {
    return null;
  }
}

/**
 * Re-applies the on-screen bounds and the one-step / hint-floor limits to a
 * plan received from the server before it is stored. Defence in depth: a plan
 * is never trusted to bound itself.
 */
export function sanitiseServerPlan(plan: SessionPlan, currentDifficulty: number, hintFloor = 1): SessionPlan {
  const [itemMin, itemMax] = SESSION_PLAN_ITEM_BOUNDS[plan.gameType] ?? [0, 0];
  const [qMin, qMax] = SESSION_PLAN_QUESTION_BOUNDS[plan.gameType] ?? [1, 1];
  const [previewMin, previewMax] = SESSION_PLAN_PREVIEW_BOUNDS;
  const difficulty =
    plan.gameType === "MEMORY_LANE"
      ? currentDifficulty
      : clampStep(currentDifficulty, clampInt(plan.difficulty, MIN_DIFFICULTY, MAX_DIFFICULTY));
  return {
    ...plan,
    difficulty,
    itemCount: clampInt(plan.itemCount, itemMin, itemMax),
    questionCount: clampInt(plan.questionCount, qMin, qMax),
    previewSeconds: clampInt(plan.previewSeconds, previewMin, previewMax),
    hintLevel: Math.max(clampHintLevel(hintFloor), clampHintLevel(plan.hintLevel)),
    isDiagnosis: false,
  };
}

export async function storeServerSessionPlan(
  plan: SessionPlan,
  currentDifficulty = plan.difficulty,
  hintFloor = 1,
): Promise<void> {
  try {
    await new SessionPlanRepository().upsert(sanitiseServerPlan(plan, currentDifficulty, hintFloor));
  } catch {
    /* the on-device plan stays in place */
  }
}

export async function storeServerSessionPlans(plans: SessionPlan[] | undefined): Promise<void> {
  for (const plan of plans ?? []) {
    await storeServerSessionPlan(plan, plan.difficulty, plan.hintLevel);
  }
}
