import type { ScheduleOccurrenceTime } from "@smritisetu/shared-types";

/** Start of the local day containing `date`, as an ISO instant. */
export function startOfDay(date = new Date()): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function endOfDay(date = new Date()): Date {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

/**
 * Every instant a schedule is due on a given local day.
 *
 * An empty daysOfWeek means "every day". Times are local, which is what a
 * patient experiences; they are converted to UTC instants for storage.
 */
export function occurrencesForDay(
  occurrences: ScheduleOccurrenceTime[],
  day = new Date(),
): Date[] {
  const dayOfWeek = day.getDay();
  const result: Date[] = [];

  for (const occurrence of occurrences) {
    const appliesToday =
      occurrence.daysOfWeek.length === 0 || occurrence.daysOfWeek.includes(dayOfWeek);
    if (!appliesToday) continue;

    const [hours, minutes] = occurrence.timeOfDay.split(":").map(Number);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) continue;

    const due = startOfDay(day);
    due.setHours(hours, minutes, 0, 0);
    result.push(due);
  }

  return result.sort((a, b) => a.getTime() - b.getTime());
}

/** "8:00 am" style, in the patient's locale. */
export function formatTime(date: Date | string, locale = "en-IN"): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return value.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function formatDayAndDate(date = new Date(), locale = "en-IN"): string {
  return date.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
}

/** "just now" / "12 minutes ago" / a date, for the last-sync line. */
export function formatRelative(iso: string | null, locale = "en-IN"): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;

  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short" });
}
