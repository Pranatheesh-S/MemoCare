import type { CachedMemory } from "../../db/repositories/memoryRepository";
import { CHOICE_COUNT_BY_DIFFICULTY, shuffle } from "../gameContent";

export type PersonChoice = {
  id: string;
  name: string;
  isCorrect: boolean;
};

export type WhoIsThisRound = {
  memory: CachedMemory;
  choices: PersonChoice[];
  /** Answers already tried, so a repeat tap is not counted twice. */
  attemptedIds: string[];
  revealed: boolean;
  hintsUsed: number;
  hintsRemaining: number;
  startedAt: number;
};

export type WhoIsThisState = {
  rounds: WhoIsThisRound[];
  index: number;
  correctFirstTry: number;
  totalAttempts: number;
  hintsUsed: number;
  completed: boolean;
  startedAt: number;
};

const ROUNDS_PER_SESSION = 4;

/**
 * Builds a session from the family photographs cached on the device.
 *
 * Only consented, available, named photographs reach this pool — the memory
 * repository filters them — and the pool never leaves the device.
 */
export function createGame(
  people: CachedMemory[],
  difficulty: number,
  hintsAllowed: number,
  random: () => number = Math.random,
  now: () => number = Date.now,
): WhoIsThisState | null {
  const named = people.filter((p) => p.personName && p.available);
  // Two people at minimum: one to ask about and one alternative answer.
  if (named.length < 2) return null;

  const choiceCount = Math.min(CHOICE_COUNT_BY_DIFFICULTY[difficulty] ?? 2, named.length);
  const selected = shuffle(named, random).slice(0, Math.min(ROUNDS_PER_SESSION, named.length));

  const rounds = selected.map((memory) => ({
    memory,
    choices: buildChoices(memory, named, choiceCount, random),
    attemptedIds: [],
    revealed: false,
    hintsUsed: 0,
    hintsRemaining: hintsAllowed,
    startedAt: now(),
  }));

  return {
    rounds,
    index: 0,
    correctFirstTry: 0,
    totalAttempts: 0,
    hintsUsed: 0,
    completed: false,
    startedAt: now(),
  };
}

function buildChoices(
  answer: CachedMemory,
  pool: CachedMemory[],
  choiceCount: number,
  random: () => number,
): PersonChoice[] {
  const distractors = shuffle(
    pool.filter((p) => p.memoryId !== answer.memoryId && p.personName !== answer.personName),
    random,
  ).slice(0, Math.max(0, choiceCount - 1));

  const choices: PersonChoice[] = [
    { id: answer.memoryId, name: answer.personName as string, isCorrect: true },
    ...distractors.map((p) => ({ id: p.memoryId, name: p.personName as string, isCorrect: false })),
  ];

  return shuffle(choices, random);
}

export type AnswerResult = {
  state: WhoIsThisState;
  isCorrect: boolean;
  /** Set once the person is revealed, whether guessed or shown. */
  revealedName?: string;
  outcome: "CORRECT" | "TRY_AGAIN" | "IGNORED";
};

/**
 * Records an answer.
 *
 * An incorrect choice is never called wrong: the round simply stays open and
 * the screen offers to try together. After the second try the person is
 * revealed warmly, and the patient is never told they forgot anyone.
 */
export function answer(state: WhoIsThisState, choiceId: string): AnswerResult {
  const round = state.rounds[state.index];
  if (!round || round.revealed) return { state, isCorrect: false, outcome: "IGNORED" };
  if (round.attemptedIds.includes(choiceId)) return { state, isCorrect: false, outcome: "IGNORED" };

  const choice = round.choices.find((c) => c.id === choiceId);
  if (!choice) return { state, isCorrect: false, outcome: "IGNORED" };

  const isFirstTry = round.attemptedIds.length === 0;
  const attemptedIds = [...round.attemptedIds, choiceId];
  const totalAttempts = state.totalAttempts + 1;

  // Reveal on a correct answer, or once two answers have been tried.
  const revealed = choice.isCorrect || attemptedIds.length >= 2;

  const rounds = [...state.rounds];
  rounds[state.index] = { ...round, attemptedIds, revealed };

  return {
    state: {
      ...state,
      rounds,
      totalAttempts,
      correctFirstTry: state.correctFirstTry + (choice.isCorrect && isFirstTry ? 1 : 0),
    },
    isCorrect: choice.isCorrect,
    revealedName: revealed ? (round.memory.personName ?? undefined) : undefined,
    outcome: choice.isCorrect ? "CORRECT" : "TRY_AGAIN",
  };
}

/** Removes one incorrect choice, making the answer easier to find. */
export function useHint(state: WhoIsThisState): { state: WhoIsThisState; removedId: string | null } {
  const round = state.rounds[state.index];
  if (!round || round.revealed || round.hintsRemaining <= 0) return { state, removedId: null };

  const removable = round.choices.find((c) => !c.isCorrect && !round.attemptedIds.includes(c.id));
  if (!removable || round.choices.length <= 2) return { state, removedId: null };

  const rounds = [...state.rounds];
  rounds[state.index] = {
    ...round,
    choices: round.choices.filter((c) => c.id !== removable.id),
    hintsUsed: round.hintsUsed + 1,
    hintsRemaining: round.hintsRemaining - 1,
  };

  return {
    state: { ...state, rounds, hintsUsed: state.hintsUsed + 1 },
    removedId: removable.id,
  };
}

/** Reveals the person without an answer being needed. */
export function reveal(state: WhoIsThisState): WhoIsThisState {
  const round = state.rounds[state.index];
  if (!round) return state;
  const rounds = [...state.rounds];
  rounds[state.index] = { ...round, revealed: true };
  return { ...state, rounds };
}

export function nextRound(state: WhoIsThisState): WhoIsThisState {
  const next = state.index + 1;
  if (next >= state.rounds.length) return { ...state, completed: true };
  return { ...state, index: next };
}

export function currentRound(state: WhoIsThisState): WhoIsThisRound | null {
  return state.rounds[state.index] ?? null;
}

/**
 * Accuracy is first-try recognitions over rounds actually reached, so leaving
 * early does not look like a run of incorrect answers.
 */
export function computeAccuracy(state: WhoIsThisState): number | null {
  const reached = state.rounds.filter((round) => round.attemptedIds.length > 0).length;
  if (reached === 0) return null;
  return Number((state.correctFirstTry / reached).toFixed(3));
}

export function averageResponseSeconds(state: WhoIsThisState, now: () => number = Date.now): number {
  const elapsed = Math.max(0, (now() - state.startedAt) / 1000);
  const reached = Math.max(1, state.rounds.filter((r) => r.attemptedIds.length > 0).length);
  return Number((elapsed / reached).toFixed(2));
}

export function elapsedSeconds(state: WhoIsThisState, now: () => number = Date.now): number {
  return Math.max(0, Math.round((now() - state.startedAt) / 1000));
}
