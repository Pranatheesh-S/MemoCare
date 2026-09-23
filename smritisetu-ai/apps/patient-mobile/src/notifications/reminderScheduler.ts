import type { ReminderEvent, Schedule } from "@smritisetu/shared-types";
import { occurrencesForDay } from "../utils/datetime";
import { derivedState } from "./reminderState";

export type PlannedReminder = {
  scheduleId: string;
  scheduleVersion: number;
  kind: Schedule["kind"];
  critical: boolean;
  titleEn: string;
  titleAs?: string;
  dueAt: Date;
  missedAfterMinutes: number;
  snoozeMinutes: number;
};

/**
 * Expands the cached schedules into the concrete reminders for one day.
 *
 * This is pure: the same schedules and the same day always produce the same
 * plan, which is what makes rescheduling after a restart safe to repeat.
 */
export function planRemindersForDay(schedules: Schedule[], day = new Date()): PlannedReminder[] {
  const planned: PlannedReminder[] = [];

  for (const schedule of schedules) {
    if (!schedule.active) continue;
    for (const dueAt of occurrencesForDay(schedule.occurrences, day)) {
      planned.push({
        scheduleId: schedule.scheduleId,
        scheduleVersion: schedule.version,
        kind: schedule.kind,
        critical: schedule.critical,
        titleEn: schedule.titleEn,
        titleAs: schedule.titleAs,
        dueAt,
        missedAfterMinutes: schedule.missedAfterMinutes,
        snoozeMinutes: schedule.snoozeMinutes,
      });
    }
  }

  return planned.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** Reminders still ahead of us — the only ones worth a local notification. */
export function upcomingOnly(planned: PlannedReminder[], now = new Date()): PlannedReminder[] {
  return planned.filter((reminder) => reminder.dueAt.getTime() > now.getTime());
}

/**
 * Merges the plan with what the device already knows, so a rebuild after a
 * restart or a schedule change keeps every action the patient already took.
 */
export function mergeWithStored(
  planned: PlannedReminder[],
  stored: ReminderEvent[],
  now = new Date(),
): Array<PlannedReminder & { existing?: ReminderEvent; state: ReminderEvent["state"] }> {
  const byOccurrence = new Map(stored.map((event) => [`${event.scheduleId}|${event.dueAt}`, event]));

  return planned.map((reminder) => {
    const key = `${reminder.scheduleId}|${reminder.dueAt.toISOString()}`;
    const existing = byOccurrence.get(key);
    const baseState = existing?.state ?? "UPCOMING";
    return {
      ...reminder,
      existing,
      state: derivedState(baseState, reminder.dueAt, reminder.missedAfterMinutes, now),
    };
  });
}

/** The next thing due, for the Home screen's "Next: …" card. */
export function nextReminder(
  merged: Array<PlannedReminder & { state: ReminderEvent["state"] }>,
  now = new Date(),
): (PlannedReminder & { state: ReminderEvent["state"] }) | null {
  const outstanding = merged
    .filter((r) => r.state !== "ACKNOWLEDGED")
    .filter((r) => r.dueAt.getTime() >= now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
  return outstanding[0] ?? null;
}

/** A snooze pushes the reminder out, but never past the end of the day. */
export function snoozedUntil(dueAt: Date, snoozeMinutes: number, now = new Date()): Date {
  const base = now.getTime() > dueAt.getTime() ? now : dueAt;
  const target = new Date(base.getTime() + snoozeMinutes * 60 * 1000);
  const endOfDay = new Date(dueAt);
  endOfDay.setHours(23, 59, 0, 0);
  return target > endOfDay ? endOfDay : target;
}
