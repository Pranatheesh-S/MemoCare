import { IllustrationId } from "../gameContent";

export type MarketItem = {
  id: string;
  labelEn: string;
  labelAs: string;
  illustrationId: IllustrationId;
};

export const MARKET_ITEMS: MarketItem[] = [
  { id: "tea", labelEn: "Tea leaves", labelAs: "চাহ পাত", illustrationId: "TeaLeaves" },
  { id: "basket", labelEn: "Bamboo basket", labelAs: "খৰাহি", illustrationId: "BambooBasket" },
  { id: "gamosa", labelEn: "Gamosa", labelAs: "গামোচা", illustrationId: "Gamosa" },
  { id: "pitha", labelEn: "Pitha", labelAs: "পিঠা", illustrationId: "Pitha" },
  { id: "pot", labelEn: "Water pot", labelAs: "কলহ", illustrationId: "WaterPot" },
  { id: "jaapi", labelEn: "Jaapi", labelAs: "জাপি", illustrationId: "Jaapi" },
  { id: "flower", labelEn: "Kopou flower", labelAs: "কপৌ ফুল", illustrationId: "KopouFlower" },
];

export type MarketMemoryState = {
  /** The items the player needs to find. */
  shoppingList: MarketItem[];
  /** Items they have already found and added to the basket. */
  foundItems: string[];
  /** The game goes through two phases: reading the list, then exploring the market. */
  phase: "READING_LIST" | "EXPLORING" | "COMPLETED";
  attempts: number;
  hintsUsed: number;
  hintsRemaining: number;
  startedAt: number;
};

const ITEMS_BY_DIFFICULTY: Record<number, number> = { 1: 3, 2: 4, 3: 5, 4: 6 };

export function createGame(
  difficulty: number,
  hintsAllowed: number,
  random: () => number = Math.random,
  now: () => number = Date.now,
  /** AI session-plan override for the shopping-list length. */
  itemCount?: number | null,
): MarketMemoryState {
  const requested = itemCount ?? ITEMS_BY_DIFFICULTY[difficulty] ?? 3;
  const count = Math.max(2, Math.min(MARKET_ITEMS.length, Math.round(requested)));
  const shuffled = [...MARKET_ITEMS].sort(() => 0.5 - random());
  const shoppingList = shuffled.slice(0, count);

  return {
    shoppingList,
    foundItems: [],
    phase: "READING_LIST",
    attempts: 0,
    hintsUsed: 0,
    hintsRemaining: hintsAllowed,
    startedAt: now(),
  };
}

export function startExploring(state: MarketMemoryState): MarketMemoryState {
  if (state.phase !== "READING_LIST") return state;
  return { ...state, phase: "EXPLORING" };
}

export type TapResult = {
  state: MarketMemoryState;
  outcome: "IGNORED" | "FOUND" | "WRONG_ITEM" | "COMPLETED";
};

export function tapItem(state: MarketMemoryState, itemId: string): TapResult {
  if (state.phase !== "EXPLORING") return { state, outcome: "IGNORED" };
  if (state.foundItems.includes(itemId)) return { state, outcome: "IGNORED" };

  const isNeeded = state.shoppingList.some((i) => i.id === itemId);
  const attempts = state.attempts + 1;

  if (!isNeeded) {
    return { state: { ...state, attempts }, outcome: "WRONG_ITEM" };
  }

  const foundItems = [...state.foundItems, itemId];
  const completed = foundItems.length === state.shoppingList.length;

  return {
    state: {
      ...state,
      foundItems,
      attempts,
      phase: completed ? "COMPLETED" : "EXPLORING",
    },
    outcome: completed ? "COMPLETED" : "FOUND",
  };
}

export type HintResult = {
  state: MarketMemoryState;
  revealedItemId: string | null;
};

export function useHint(state: MarketMemoryState): HintResult {
  if (state.hintsRemaining <= 0 || state.phase !== "EXPLORING") {
    return { state, revealedItemId: null };
  }

  const missing = state.shoppingList.filter((item) => !state.foundItems.includes(item.id));
  if (missing.length === 0) return { state, revealedItemId: null };

  return {
    state: {
      ...state,
      hintsUsed: state.hintsUsed + 1,
      hintsRemaining: state.hintsRemaining - 1,
    },
    revealedItemId: missing[0].id,
  };
}

export function computeAccuracy(state: MarketMemoryState): number | null {
  if (state.attempts === 0) return null;
  return Number(Math.min(1, state.foundItems.length / state.attempts).toFixed(3));
}

export function elapsedSeconds(state: MarketMemoryState, now: () => number = Date.now): number {
  return Math.max(0, Math.round((now() - state.startedAt) / 1000));
}

export function averageResponseSeconds(state: MarketMemoryState, now: () => number = Date.now): number {
  const elapsed = elapsedSeconds(state, now);
  if (state.attempts === 0) return elapsed;
  return Number((elapsed / state.attempts).toFixed(2));
}
