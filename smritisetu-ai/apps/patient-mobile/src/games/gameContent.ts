/**
 * Game content: pure data only.
 *
 * Illustrations are referenced by id and resolved to components in
 * illustrationMap.tsx, so the game logic stays free of any rendering
 * dependency and can be tested on its own.
 */
import type { Schedule, ScheduleKind } from "@smritisetu/shared-types";
import type { ContentPack, CulturalObject } from "../content/types";
import { DEFAULT_CONTENT_PACK } from "../content";

export type IllustrationId = string;

/** The place an object lives at home; the second card of a match pair. */
export type MatchPlace = CulturalObject["place"];

/**
 * A Memory Match card: a household/cultural object and the place it lives. The
 * pool now comes from the patient's regional {@link ContentPack} rather than a
 * single hard-coded set — the game trains "where did I keep it?", the deficit
 * families notice first, in objects the patient actually grew up with.
 */
export type MatchObject = CulturalObject;

/**
 * The default object pool (Assam), used when no pack is supplied — e.g. in unit
 * tests and the local demo. Screens pass the resolved pack explicitly.
 */
export const MATCH_OBJECTS: MatchObject[] = DEFAULT_CONTENT_PACK.matchObjects;

/** Difficulty 1..4 -> how many cards are on the board. */
export const CARD_COUNT_BY_DIFFICULTY: Record<number, number> = { 1: 8, 2: 8, 3: 10, 4: 12 };

/** Longer preview at the gentlest level; level 4 keeps a short but real look. */
export const PREVIEW_SECONDS_BY_DIFFICULTY: Record<number, number> = { 1: 8, 2: 6, 3: 5, 4: 4 };

/** How many hints are offered before the button rests. */
export const HINTS_BY_DIFFICULTY: Record<number, number> = { 1: 3, 2: 3, 3: 2, 4: 1 };

/**
 * Chooses the objects for one round.
 *
 * At level 4 the set is drawn from look-alike groups, which is the intended
 * extra challenge — never smaller cards or a shorter list of hints alone.
 */
export function selectMatchObjects(
  difficulty: number,
  random: () => number = Math.random,
  pack: ContentPack = DEFAULT_CONTENT_PACK,
  /** AI session-plan override for the total number of cards (rounded to a pair). */
  cardCountOverride?: number,
): MatchObject[] {
  const pool = pack.matchObjects;
  const cards = cardCountOverride ?? CARD_COUNT_BY_DIFFICULTY[difficulty] ?? 4;
  const pairs = Math.max(2, Math.min(Math.floor(pool.length), Math.round(cards / 2)));

  if (difficulty >= 4) {
    const grouped = new Map<string, MatchObject[]>();
    for (const object of pool) {
      if (!object.similarGroup) continue;
      grouped.set(object.similarGroup, [...(grouped.get(object.similarGroup) ?? []), object]);
    }
    const similar = [...grouped.values()].flat();
    if (similar.length >= pairs) return shuffle(similar, random).slice(0, pairs);
  }

  return shuffle([...pool], random).slice(0, pairs);
}

export type CardKind = "object" | "place";

export type MatchCard = {
  cardId: string;
  objectId: string;
  object: MatchObject;
  /** Object and place cards of a pair share objectId so flipCard is unchanged. */
  kind: CardKind;
};

/** Builds a shuffled board of face-down pairs: one object, one place. */
export function buildBoard(objects: MatchObject[], random: () => number = Math.random): MatchCard[] {
  const cards: MatchCard[] = [];
  for (const object of objects) {
    cards.push({ cardId: `${object.id}-a`, objectId: object.id, object, kind: "object" });
    cards.push({ cardId: `${object.id}-b`, objectId: object.id, object, kind: "object" });
  }
  return shuffle(cards, random);
}

export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/* -------------------------------------------------------------------------- */
/*  Routine Builder                                                           */
/* -------------------------------------------------------------------------- */

export type RoutineStep = {
  id: string;
  labelEn: string;
  labelAs: string;
  illustrationId: IllustrationId;
};

/** The default morning routine, used when the caregiver has not set one. */
export const DEFAULT_ROUTINE: RoutineStep[] = [
  { id: "wake_up", labelEn: "Wake up", labelAs: "সাৰ পাওক", illustrationId: "SunRise" },
  { id: "brush_teeth", labelEn: "Brush teeth", labelAs: "দাঁত ব্ৰাছ কৰক", illustrationId: "Toothbrush" },
  { id: "breakfast", labelEn: "Eat breakfast", labelAs: "ৰাতিপুৱাৰ আহাৰ খাওক", illustrationId: "Plate" },
  { id: "medicine", labelEn: "Take medicine", labelAs: "ঔষধ লওক", illustrationId: "MedicineTablet" },
  { id: "water", labelEn: "Drink water", labelAs: "পানী খাওক", illustrationId: "WaterGlass" },
  { id: "walk", labelEn: "Walk outside", labelAs: "বাহিৰত খোজ কাঢ়ক", illustrationId: "Walking" },
  { id: "family", labelEn: "Talk to family", labelAs: "পৰিয়ালৰ লগত কথা পাতক", illustrationId: "FamilyTogether" },
  { id: "sleep", labelEn: "Go to sleep", labelAs: "শুবলৈ যাওক", illustrationId: "Moon" },
];

/** Difficulty 1..4 -> how many activity cards to arrange. */
export const ROUTINE_LENGTH_BY_DIFFICULTY: Record<number, number> = { 1: 3, 2: 4, 3: 5, 4: 6 };

export function selectRoutineSteps(difficulty: number): RoutineStep[] {
  const length = ROUTINE_LENGTH_BY_DIFFICULTY[difficulty] ?? 3;
  return DEFAULT_ROUTINE.slice(0, Math.min(length, DEFAULT_ROUTINE.length));
}

const SCHEDULE_KIND_ILLUSTRATION: Record<ScheduleKind, IllustrationId> = {
  MEDICINE: "MedicineTablet",
  HYDRATION: "WaterGlass",
  MEAL: "Plate",
  EXERCISE: "Walking",
  APPOINTMENT: "Calendar",
  SLEEP: "Moon",
  FAMILY_CHECK_IN: "FamilyTogether",
};

/** Below this many real schedules due today, a fair ordering puzzle cannot be built. */
const MIN_REAL_SCHEDULES = 3;

/**
 * Turns the caregiver's real schedules into today's routine-ordering puzzle,
 * so the sequence the patient arranges is their own day, not a script.
 *
 * A schedule due more than once today (three medicine doses) contributes only
 * its earliest occurrence — otherwise it would appear more than once in a
 * single ordering, which no arrangement could solve. Two schedules due at the
 * exact same time make the ordering ambiguous for the same reason, so only
 * the first survives.
 *
 * Returns null when there is too little real data for a fair puzzle, so the
 * caller can fall back to {@link selectRoutineSteps}.
 */
export function selectRoutineStepsFromSchedules(
  schedules: Schedule[],
  difficulty: number,
  day: Date = new Date(),
): RoutineStep[] | null {
  const weekday = day.getDay();

  const earliestDueToday = new Map<string, { schedule: Schedule; timeOfDay: string }>();
  for (const schedule of schedules) {
    if (!schedule.active) continue;
    for (const occurrence of schedule.occurrences) {
      const appliesToday = occurrence.daysOfWeek.length === 0 || occurrence.daysOfWeek.includes(weekday);
      if (!appliesToday) continue;
      const existing = earliestDueToday.get(schedule.scheduleId);
      if (!existing || occurrence.timeOfDay < existing.timeOfDay) {
        earliestDueToday.set(schedule.scheduleId, { schedule, timeOfDay: occurrence.timeOfDay });
      }
    }
  }

  const sorted = [...earliestDueToday.values()].sort((a, b) => {
    if (a.timeOfDay !== b.timeOfDay) return a.timeOfDay < b.timeOfDay ? -1 : 1;
    return a.schedule.scheduleId < b.schedule.scheduleId ? -1 : 1;
  });

  const usedTimes = new Set<string>();
  const withoutTies = sorted.filter(({ timeOfDay }) => {
    if (usedTimes.has(timeOfDay)) return false;
    usedTimes.add(timeOfDay);
    return true;
  });

  if (withoutTies.length < MIN_REAL_SCHEDULES) return null;

  const length = ROUTINE_LENGTH_BY_DIFFICULTY[difficulty] ?? 3;
  return withoutTies.slice(0, Math.min(length, withoutTies.length)).map(({ schedule }) => ({
    id: schedule.scheduleId,
    labelEn: schedule.titleEn,
    labelAs: schedule.titleAs ?? schedule.titleEn,
    illustrationId: SCHEDULE_KIND_ILLUSTRATION[schedule.kind],
  }));
}

/** Difficulty 1..4 -> how many answer choices in "Who Is This?". */
export const CHOICE_COUNT_BY_DIFFICULTY: Record<number, number> = { 1: 2, 2: 2, 3: 3, 4: 4 };
