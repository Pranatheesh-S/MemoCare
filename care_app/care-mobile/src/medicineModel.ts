/**
 * Pure model for the "medicines the patient has taken" log. Dependency-free so
 * it is unit-tested; Firestore CRUD lives in `medicines.ts`.
 */
import type { RoutineItem } from "./routineModel";

export const MEDICINE_STATUSES = ["taken", "missed", "skipped"] as const;
export type MedicineStatus = (typeof MEDICINE_STATUSES)[number];

export const MEDICINE_STATUS_LABEL: Record<MedicineStatus, string> = {
  taken: "Taken",
  missed: "Missed",
  skipped: "Skipped",
};

export type MedicineLogEntry = {
  id?: string;
  /** "YYYY-MM-DD" the dose was for. */
  date: string;
  /** Scheduled "HH:MM", if it came from the routine. */
  time?: string;
  name: string;
  status: MedicineStatus;
  loggedByRole: "caregiver" | "healthcare_worker" | "patient";
  loggedByName?: string;
  loggedAt: string;
  note?: string;
};

export type MedicineDay = {
  date: string;
  entries: MedicineLogEntry[];
  taken: number;
  missed: number;
};

function byTime(a: MedicineLogEntry, b: MedicineLogEntry): number {
  return (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.loggedAt.localeCompare(b.loggedAt);
}

/** Newest day first; entries inside a day ordered by scheduled time. */
export function groupByDay(entries: MedicineLogEntry[]): MedicineDay[] {
  const map = new Map<string, MedicineLogEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      entries: [...list].sort(byTime),
      taken: list.filter((e) => e.status === "taken").length,
      missed: list.filter((e) => e.status === "missed").length,
    }));
}

export type Adherence = { taken: number; considered: number; pct: number | null };

/** Adherence = taken / (taken + missed). "skipped" (deliberately held) is left
 *  out of the denominator. */
export function adherence(entries: MedicineLogEntry[]): Adherence {
  const taken = entries.filter((e) => e.status === "taken").length;
  const missed = entries.filter((e) => e.status === "missed").length;
  const considered = taken + missed;
  return { taken, considered, pct: considered === 0 ? null : Math.round((taken / considered) * 100) };
}

export type PlannedDose = {
  time: string;
  name: string;
  critical: boolean;
  status: MedicineStatus | "pending";
  entryId?: string;
};

/** Today's medicine items from the routine, each matched to a log entry so the
 *  screen can show Taken / Missed / Pending and let the caregiver fill the gaps. */
export function todaysDoses(scheduled: RoutineItem[], todaysLog: MedicineLogEntry[]): PlannedDose[] {
  return scheduled
    .filter((it) => it.kind === "medicine")
    .map((it): PlannedDose => {
      const hit = todaysLog.find(
        (e) => e.name.trim().toLowerCase() === it.title.trim().toLowerCase() && (!e.time || e.time === it.time),
      );
      return {
        time: it.time,
        name: it.title,
        critical: Boolean(it.critical),
        status: hit?.status ?? "pending",
        entryId: hit?.id,
      };
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}
