import { selectRoutineSteps, shuffle, type RoutineStep } from "../gameContent";

export type RoutineBuilderState = {
  /** The order the patient has arranged, by step id. */
  order: string[];
  correctOrder: string[];
  steps: Record<string, RoutineStep>;
  /** The card the patient has picked up, if any. */
  selectedId: string | null;
  /** Positions fixed by a hint; these are not counted as the patient's work. */
  lockedPositions: number[];
  moves: number;
  hintsUsed: number;
  hintsRemaining: number;
  checked: boolean;
  completed: boolean;
  startedAt: number;
};

export function createGame(
  difficulty: number,
  hintsAllowed: number,
  random: () => number = Math.random,
  now: () => number = Date.now,
  /** The caregiver's real routine for today, when there is enough of it. Falls back to the default. */
  steps: RoutineStep[] = selectRoutineSteps(difficulty),
): RoutineBuilderState {
  const selected = steps;
  const correctOrder = selected.map((step) => step.id);

  // Shuffle until the starting order is not already correct, so there is always
  // something to do. Bounded so a one-card round cannot loop.
  let order = shuffle(correctOrder, random);
  for (let attempt = 0; attempt < 10 && sameOrder(order, correctOrder); attempt++) {
    order = shuffle(correctOrder, random);
  }

  return {
    order,
    correctOrder,
    steps: Object.fromEntries(selected.map((step) => [step.id, step])),
    selectedId: null,
    lockedPositions: [],
    moves: 0,
    hintsUsed: 0,
    hintsRemaining: hintsAllowed,
    checked: false,
    completed: false,
    startedAt: now(),
  };
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Tap-to-select, then tap-to-place.
 *
 * Deliberately not drag-and-drop: a precise drag is hard with unsteady hands,
 * and a dropped drag loses the card. Two taps always work.
 */
export function selectCard(state: RoutineBuilderState, stepId: string): RoutineBuilderState {
  if (state.completed) return state;
  const position = state.order.indexOf(stepId);
  if (position === -1) return state;
  if (state.lockedPositions.includes(position)) return state;

  // Tapping the selected card again puts it back down.
  if (state.selectedId === stepId) return { ...state, selectedId: null };

  // A second tap on a different card swaps the two.
  if (state.selectedId) return swapWith(state, stepId);

  return { ...state, selectedId: stepId };
}

function swapWith(state: RoutineBuilderState, targetId: string): RoutineBuilderState {
  const from = state.order.indexOf(state.selectedId as string);
  const to = state.order.indexOf(targetId);
  if (from === -1 || to === -1) return { ...state, selectedId: null };
  if (state.lockedPositions.includes(to)) return { ...state, selectedId: null };

  const order = [...state.order];
  [order[from], order[to]] = [order[to], order[from]];

  return { ...state, order, selectedId: null, moves: state.moves + 1, checked: false };
}

/** Explicit up/down controls, an alternative to selecting and swapping. */
export function moveCard(
  state: RoutineBuilderState,
  stepId: string,
  direction: "UP" | "DOWN",
): RoutineBuilderState {
  if (state.completed) return state;
  const from = state.order.indexOf(stepId);
  if (from === -1) return state;

  const to = direction === "UP" ? from - 1 : from + 1;
  if (to < 0 || to >= state.order.length) return state;
  if (state.lockedPositions.includes(from) || state.lockedPositions.includes(to)) return state;

  const order = [...state.order];
  [order[from], order[to]] = [order[to], order[from]];

  return { ...state, order, selectedId: null, moves: state.moves + 1, checked: false };
}

export type HintResult = { state: RoutineBuilderState; placedStepId: string | null; position: number };

/**
 * Places one activity in its correct position and locks it there.
 *
 * The hint does the work for the patient rather than merely pointing — being
 * told "that one is wrong" is discouraging, being shown "this one goes here"
 * is not.
 */
export function useHint(state: RoutineBuilderState): HintResult {
  if (state.hintsRemaining <= 0 || state.completed) {
    return { state, placedStepId: null, position: -1 };
  }

  const wrongPosition = state.correctOrder.findIndex(
    (stepId, index) => state.order[index] !== stepId && !state.lockedPositions.includes(index),
  );
  if (wrongPosition === -1) return { state, placedStepId: null, position: -1 };

  const shouldBe = state.correctOrder[wrongPosition];
  const currentlyAt = state.order.indexOf(shouldBe);

  const order = [...state.order];
  [order[wrongPosition], order[currentlyAt]] = [order[currentlyAt], order[wrongPosition]];

  const lockedPositions = [...state.lockedPositions, wrongPosition];

  // A hint swaps two cards, so both were moved by the hint. If the card that
  // travelled the other way also lands correctly, that position is the hint's
  // doing too and must not be credited to the patient.
  if (order[currentlyAt] === state.correctOrder[currentlyAt] && !lockedPositions.includes(currentlyAt)) {
    lockedPositions.push(currentlyAt);
  }

  // Once every other position is hinted, the one left over is forced: its
  // content is decided by elimination, not placed by the patient. Locking it
  // too keeps accuracy an honest measure of the patient's own work.
  const stillOpen = order
    .map((_, index) => index)
    .filter((index) => !lockedPositions.includes(index));
  if (stillOpen.length === 1) lockedPositions.push(stillOpen[0]);

  return {
    state: {
      ...state,
      order,
      selectedId: null,
      lockedPositions,
      hintsUsed: state.hintsUsed + 1,
      hintsRemaining: state.hintsRemaining - 1,
      checked: false,
    },
    placedStepId: shouldBe,
    position: wrongPosition,
  };
}

export type CheckResult = {
  state: RoutineBuilderState;
  correctPositions: number;
  totalPositions: number;
  isComplete: boolean;
};

export function check(state: RoutineBuilderState): CheckResult {
  const correctPositions = countCorrect(state);
  const isComplete = correctPositions === state.correctOrder.length;
  return {
    state: { ...state, checked: true, completed: isComplete },
    correctPositions,
    totalPositions: state.correctOrder.length,
    isComplete,
  };
}

export function countCorrect(state: RoutineBuilderState): number {
  return state.order.reduce(
    (total, stepId, index) => (stepId === state.correctOrder[index] ? total + 1 : total),
    0,
  );
}

/** Which positions are right, so the screen can mark them gently. */
export function correctPositionFlags(state: RoutineBuilderState): boolean[] {
  return state.order.map((stepId, index) => stepId === state.correctOrder[index]);
}

/**
 * Accuracy counts only the positions the patient placed themselves — a hinted
 * position is excluded from both the numerator and the denominator, so hints
 * neither inflate nor deflate the score.
 */
export function computeAccuracy(state: RoutineBuilderState): number | null {
  const unlockedIndexes = state.correctOrder
    .map((_, index) => index)
    .filter((index) => !state.lockedPositions.includes(index));

  if (unlockedIndexes.length === 0) return null;

  const correct = unlockedIndexes.filter(
    (index) => state.order[index] === state.correctOrder[index],
  ).length;
  return Number((correct / unlockedIndexes.length).toFixed(3));
}

export function elapsedSeconds(state: RoutineBuilderState, now: () => number = Date.now): number {
  return Math.max(0, Math.round((now() - state.startedAt) / 1000));
}
