/**
 * Pure model for a patient's daily routine. Dependency-free so it is unit-tested
 * and shared with the AI-suggestion prompt builder. Firestore CRUD lives in
 * `routines.ts`.
 */
export const ROUTINE_KINDS = [
  "medicine",
  "meal",
  "activity",
  "exercise",
  "hygiene",
  "social",
  "rest",
  "other",
] as const;
export type RoutineKind = (typeof ROUTINE_KINDS)[number];

export const ROUTINE_KIND_LABEL: Record<RoutineKind, string> = {
  medicine: "Medicine",
  meal: "Meal",
  activity: "Activity",
  exercise: "Exercise",
  hygiene: "Wash & dress",
  social: "Family time",
  rest: "Rest",
  other: "Other",
};

/** Feather icon name per kind (kept here so the model stays the single source). */
export const ROUTINE_KIND_ICON: Record<RoutineKind, string> = {
  medicine: "plus-square",
  meal: "coffee",
  activity: "sun",
  exercise: "activity",
  hygiene: "droplet",
  social: "users",
  rest: "moon",
  other: "clock",
};

export type RoutineItem = {
  /** 24h "HH:MM". */
  time: string;
  title: string;
  kind: RoutineKind;
  note?: string;
  /** e.g. a critical morning medicine — surfaced more prominently. */
  critical?: boolean;
};

export type RoutineSource = "caregiver" | "ai";

export type RoutineDay = {
  /** "YYYY-MM-DD" (local date). */
  date: string;
  items: RoutineItem[];
  source: RoutineSource;
  /** An AI-drafted day is not live until the caregiver approves it. */
  approved: boolean;
  createdAt: string;
  updatedAt?: string;
  /** How many past days the AI draft was based on (for the UI). */
  basedOnDays?: number;
};

/** The AI only starts drafting once there are at least this many approved days. */
export const MIN_DAYS_FOR_AI_SUGGESTIONS = 3;

export function canSuggestRoutine(approvedDayCount: number): boolean {
  return approvedDayCount >= MIN_DAYS_FOR_AI_SUGGESTIONS;
}

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

export function isValidTime(t: string): boolean {
  return TIME_RE.test(t.trim());
}

/** "9:5" -> "09:05"; leaves an unparseable value untouched. */
export function normaliseTime(t: string): string {
  const m = t.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!m) return t.trim();
  const h = Math.min(23, Number(m[1]));
  const min = Math.min(59, Number(m[2]));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function sortItems(items: RoutineItem[]): RoutineItem[] {
  return [...items].sort((a, b) => normaliseTime(a.time).localeCompare(normaliseTime(b.time)));
}

/** Trims, drops rows without a title, normalises time, omits empty optionals
 *  (Firestore rejects `undefined`), and returns them in time order. */
export function cleanRoutineItems(items: RoutineItem[]): RoutineItem[] {
  const cleaned = items
    .map((it) => {
      const title = it.title.trim();
      const note = it.note?.trim();
      const kind: RoutineKind = ROUTINE_KINDS.includes(it.kind) ? it.kind : "other";
      return {
        time: normaliseTime(it.time || "08:00"),
        title,
        kind,
        ...(note ? { note } : {}),
        ...(it.critical ? { critical: true } : {}),
      };
    })
    .filter((it) => it.title.length > 0);
  return sortItems(cleaned);
}

export function medicineItems(day: Pick<RoutineDay, "items">): RoutineItem[] {
  return sortItems(day.items.filter((it) => it.kind === "medicine"));
}

/* --------------------------------- dates --------------------------------- */

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now);
}

export function addDays(isoDate: string, n: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + n));
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayOf(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

export function humanDate(isoDate: string, today: string = todayISO()): string {
  if (isoDate === today) return "Today";
  if (isoDate === addDays(today, 1)) return "Tomorrow";
  if (isoDate === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = isoDate.split("-").map(Number);
  return `${weekdayOf(isoDate)}, ${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
}

/* ------------------------------ starter week ---------------------------- */

/**
 * Five realistic approved days (yesterday back to five days ago) so a caregiver
 * has something to edit from and the AI draft has real history to learn from.
 * A calm dementia-friendly rhythm with the same two medicines every day and a
 * little day-to-day variety in the activities.
 */
export function sampleRoutineDays(today: string = todayISO()): RoutineDay[] {
  const base: RoutineItem[] = [
    { time: "06:30", title: "Wake up, open the curtains", kind: "rest" },
    { time: "07:00", title: "Wash and dress", kind: "hygiene" },
    { time: "08:00", title: "Morning tablet", kind: "medicine", critical: true, note: "after breakfast, with water" },
    { time: "08:15", title: "Breakfast — rice, egg, red tea", kind: "meal" },
    { time: "09:30", title: "Short walk in the courtyard", kind: "exercise" },
    { time: "10:30", title: "Look through the family photo album", kind: "activity" },
    { time: "11:30", title: "Rest and listen to the radio", kind: "rest" },
    { time: "13:00", title: "Lunch — rice, dal, vegetables", kind: "meal" },
    { time: "13:45", title: "Afternoon nap", kind: "rest" },
    { time: "16:00", title: "Tea and a light snack", kind: "meal" },
    { time: "16:30", title: "Call with family", kind: "social" },
    { time: "18:00", title: "Evening prayer", kind: "activity" },
    { time: "19:30", title: "Dinner", kind: "meal" },
    { time: "20:00", title: "Evening tablet", kind: "medicine", critical: true },
    { time: "20:30", title: "Warm milk and quiet music", kind: "rest" },
    { time: "21:00", title: "Bed", kind: "rest" },
  ];
  const variants: [string, string][] = [
    ["Fold clothes together", "Water the plants"],
    ["Sort lentils and rice", "Sing old songs together"],
    ["Look at wedding photos", "Short walk to the gate"],
    ["Name-the-object game", "Sit in the sun on the veranda"],
    ["Large-piece jigsaw puzzle", "Tell a story from childhood"],
  ];
  const now = new Date().toISOString();
  return [1, 2, 3, 4, 5].map((n, idx) => {
    const items = base.map((it) => ({ ...it }));
    const [morning, afternoon] = variants[idx];
    const i = items.findIndex((it) => it.time === "10:30");
    if (i >= 0) items[i] = { ...items[i], title: morning };
    items.push({ time: "15:00", title: afternoon, kind: "activity" });
    return {
      date: addDays(today, -n),
      items: cleanRoutineItems(items),
      source: "caregiver" as const,
      approved: true,
      createdAt: now,
    };
  });
}

/* --------------------------- AI prompt helpers --------------------------- */

/** A compact, readable digest of recent approved days for the model. */
export function summariseRoutineDays(days: RoutineDay[]): string {
  return days
    .filter((d) => d.approved)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      const lines = sortItems(d.items)
        .map((it) => `  ${it.time} ${ROUTINE_KIND_LABEL[it.kind]}: ${it.title}${it.critical ? " (important)" : ""}`)
        .join("\n");
      return `${weekdayOf(d.date)} ${d.date}\n${lines}`;
    })
    .join("\n\n");
}
