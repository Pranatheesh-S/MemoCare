import type { CachedMemory } from "../../db/repositories/memoryRepository";

/**
 * Memory Lane is a calm reminiscence activity.
 *
 * It has no score, no accuracy, no attempts and no completion target. The only
 * things recorded are engagement time, which assets were seen, whether audio
 * was played, and whether the patient chose to finish — nothing that could be
 * read as a performance measure.
 */
export type MemoryLaneState = {
  assets: CachedMemory[];
  index: number;
  viewedIds: string[];
  audioPlayedCount: number;
  startedAt: number;
  voluntaryCompletion: boolean;
};

export function createSession(assets: CachedMemory[], now: () => number = Date.now): MemoryLaneState {
  const available = assets.filter((asset) => asset.available);
  return {
    assets: available,
    index: 0,
    viewedIds: available.length > 0 ? [available[0].memoryId] : [],
    audioPlayedCount: 0,
    startedAt: now(),
    voluntaryCompletion: false,
  };
}

export function next(state: MemoryLaneState): MemoryLaneState {
  if (state.assets.length === 0) return state;
  const index = Math.min(state.index + 1, state.assets.length - 1);
  return recordView({ ...state, index });
}

export function previous(state: MemoryLaneState): MemoryLaneState {
  if (state.assets.length === 0) return state;
  const index = Math.max(state.index - 1, 0);
  return recordView({ ...state, index });
}

function recordView(state: MemoryLaneState): MemoryLaneState {
  const current = state.assets[state.index];
  if (!current || state.viewedIds.includes(current.memoryId)) return state;
  return { ...state, viewedIds: [...state.viewedIds, current.memoryId] };
}

export function recordAudioPlayed(state: MemoryLaneState): MemoryLaneState {
  return { ...state, audioPlayedCount: state.audioPlayedCount + 1 };
}

export function markVoluntaryCompletion(state: MemoryLaneState): MemoryLaneState {
  return { ...state, voluntaryCompletion: true };
}

export function currentAsset(state: MemoryLaneState): CachedMemory | null {
  return state.assets[state.index] ?? null;
}

export function hasPrevious(state: MemoryLaneState): boolean {
  return state.index > 0;
}

export function hasNext(state: MemoryLaneState): boolean {
  return state.index < state.assets.length - 1;
}

export function engagementSeconds(state: MemoryLaneState, now: () => number = Date.now): number {
  return Math.max(0, Math.round((now() - state.startedAt) / 1000));
}

/**
 * The session record for Memory Lane.
 *
 * `accuracy` is always null and `abandoned` is always false: leaving a
 * reminiscence activity early is not abandonment, it is simply the end of a
 * quiet moment.
 */
export function toSessionMetrics(state: MemoryLaneState, now: () => number = Date.now) {
  return {
    accuracy: null,
    attempts: 0,
    hintsUsed: 0,
    responseTimeSeconds: 0,
    completed: true,
    abandoned: false,
    engagementDurationSeconds: engagementSeconds(state, now),
    detail: {
      assetsViewed: state.viewedIds,
      audioPlayedCount: state.audioPlayedCount,
      voluntaryCompletion: state.voluntaryCompletion,
    },
  };
}
