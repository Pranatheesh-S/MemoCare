import { buildBoard, selectMatchObjects, type MatchCard } from "../gameContent";
import type { ContentPack } from "../../content/types";

export type CardState = "FACE_DOWN" | "FACE_UP" | "MATCHED";

export type MemoryMatchState = {
  cards: MatchCard[];
  states: Record<string, CardState>;
  /** Card ids currently turned over and awaiting comparison. */
  flipped: string[];
  matchedPairs: number;
  totalPairs: number;
  attempts: number;
  hintsUsed: number;
  hintsRemaining: number;
  previewing: boolean;
  completed: boolean;
  startedAt: number;
};

export function createGame(
  difficulty: number,
  hintsAllowed: number,
  random: () => number = Math.random,
  now: () => number = Date.now,
  pack?: ContentPack,
  /** AI session-plan override for the number of cards on the board. */
  cardCount?: number | null,
): MemoryMatchState {
  const objects = selectMatchObjects(difficulty, random, pack, cardCount ?? undefined);
  const cards = buildBoard(objects, random);
  const states: Record<string, CardState> = {};
  // The preview shows every card face up before play begins.
  for (const card of cards) states[card.cardId] = "FACE_UP";

  return {
    cards,
    states,
    flipped: [],
    matchedPairs: 0,
    totalPairs: objects.length,
    attempts: 0,
    hintsUsed: 0,
    hintsRemaining: hintsAllowed,
    previewing: true,
    completed: false,
    startedAt: now(),
  };
}

/** Ends the preview and turns everything face down. */
export function endPreview(state: MemoryMatchState): MemoryMatchState {
  if (!state.previewing) return state;
  const states = { ...state.states };
  for (const card of state.cards) {
    if (states[card.cardId] !== "MATCHED") states[card.cardId] = "FACE_DOWN";
  }
  return { ...state, states, previewing: false };
}

export type FlipResult = {
  state: MemoryMatchState;
  /** What just happened, so the screen can speak the right encouragement. */
  outcome: "IGNORED" | "FLIPPED" | "MATCH" | "NO_MATCH" | "COMPLETED";
};

/**
 * Turns one card over.
 *
 * A tap is ignored rather than penalised when it cannot mean anything — during
 * the preview, on an already-matched card, or while two cards are being
 * compared. Nothing a patient taps is ever treated as a mistake.
 */
export function flipCard(state: MemoryMatchState, cardId: string): FlipResult {
  if (state.previewing || state.completed) return { state, outcome: "IGNORED" };
  if (state.flipped.length >= 2) return { state, outcome: "IGNORED" };

  const current = state.states[cardId];
  if (current !== "FACE_DOWN") return { state, outcome: "IGNORED" };

  const states = { ...state.states, [cardId]: "FACE_UP" as CardState };
  const flipped = [...state.flipped, cardId];

  if (flipped.length < 2) {
    return { state: { ...state, states, flipped }, outcome: "FLIPPED" };
  }

  // Two cards are up: this counts as one attempt.
  const [firstId, secondId] = flipped;
  const first = state.cards.find((c) => c.cardId === firstId);
  const second = state.cards.find((c) => c.cardId === secondId);
  const isMatch = Boolean(first && second && first.objectId === second.objectId);
  const attempts = state.attempts + 1;

  if (!isMatch) {
    return { state: { ...state, states, flipped, attempts }, outcome: "NO_MATCH" };
  }

  states[firstId] = "MATCHED";
  states[secondId] = "MATCHED";
  const matchedPairs = state.matchedPairs + 1;
  const completed = matchedPairs === state.totalPairs;

  return {
    state: { ...state, states, flipped: [], matchedPairs, attempts, completed },
    outcome: completed ? "COMPLETED" : "MATCH",
  };
}

/** Turns the two mismatched cards back over after the patient has seen them. */
export function resolveMismatch(state: MemoryMatchState): MemoryMatchState {
  if (state.flipped.length < 2) return state;
  const states = { ...state.states };
  for (const cardId of state.flipped) {
    if (states[cardId] === "FACE_UP") states[cardId] = "FACE_DOWN";
  }
  return { ...state, states, flipped: [] };
}

export type HintResult = {
  state: MemoryMatchState;
  /** The pair the hint reveals, so the screen can highlight them. */
  revealed: string[];
};

/**
 * Reveals one unmatched pair.
 *
 * A hint always helps: it never costs the patient anything beyond being
 * recorded, and it is offered rather than demanded.
 */
export function useHint(state: MemoryMatchState): HintResult {
  if (state.hintsRemaining <= 0 || state.completed) return { state, revealed: [] };

  const unmatched = state.cards.filter((card) => state.states[card.cardId] !== "MATCHED");
  const byObject = new Map<string, string[]>();
  for (const card of unmatched) {
    byObject.set(card.objectId, [...(byObject.get(card.objectId) ?? []), card.cardId]);
  }
  const pair = [...byObject.values()].find((ids) => ids.length === 2);
  if (!pair) return { state, revealed: [] };

  const states = { ...state.states };
  for (const cardId of pair) states[cardId] = "FACE_UP";

  return {
    state: {
      ...state,
      states,
      flipped: [],
      hintsUsed: state.hintsUsed + 1,
      hintsRemaining: state.hintsRemaining - 1,
    },
    revealed: pair,
  };
}

/** Hides a revealed hint again, leaving matched cards alone. */
export function hideHint(state: MemoryMatchState, revealed: string[]): MemoryMatchState {
  const states = { ...state.states };
  for (const cardId of revealed) {
    if (states[cardId] === "FACE_UP") states[cardId] = "FACE_DOWN";
  }
  return { ...state, states };
}

/**
 * Accuracy is matches divided by attempts.
 *
 * A game with no attempts has no accuracy — null, never zero, because "no data"
 * and "got everything wrong" must never look the same to the ML service.
 */
export function computeAccuracy(state: MemoryMatchState): number | null {
  if (state.attempts === 0) return null;
  return Number(Math.min(1, state.matchedPairs / state.attempts).toFixed(3));
}

export function elapsedSeconds(state: MemoryMatchState, now: () => number = Date.now): number {
  return Math.max(0, Math.round((now() - state.startedAt) / 1000));
}

/** Average seconds per attempt, for the trend indicators. */
export function averageResponseSeconds(state: MemoryMatchState, now: () => number = Date.now): number {
  const elapsed = elapsedSeconds(state, now);
  if (state.attempts === 0) return elapsed;
  return Number((elapsed / state.attempts).toFixed(2));
}
