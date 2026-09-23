import type { ReminderState } from "@smritisetu/shared-types";

/**
 * Reminder state machine.
 *
 * The wording matters as much as the transitions: "ACKNOWLEDGED" means the
 * patient pressed Done on the reminder. It never means the medicine was taken,
 * and nothing in this file or its callers may imply that it does.
 */
export const ALLOWED_TRANSITIONS: Record<ReminderState, ReminderState[]> = {
  UPCOMING: ["DUE", "ACKNOWLEDGED", "SNOOZED", "HELP_REQUESTED"],
  DUE: ["ACKNOWLEDGED", "SNOOZED", "MISSED", "HELP_REQUESTED"],
  SNOOZED: ["DUE", "ACKNOWLEDGED", "MISSED", "HELP_REQUESTED"],
  // Terminal states. A patient who returns later can still mark it done, which
  // is why MISSED is not a dead end.
  MISSED: ["ACKNOWLEDGED", "HELP_REQUESTED"],
  ACKNOWLEDGED: [],
  HELP_REQUESTED: ["ACKNOWLEDGED", "SNOOZED"],
};

export function canTransition(from: ReminderState, to: ReminderState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export type TransitionResult =
  | { ok: true; state: ReminderState }
  | { ok: false; reason: string; state: ReminderState };

export function transition(from: ReminderState, to: ReminderState): TransitionResult {
  if (from === to) return { ok: true, state: to };
  if (!canTransition(from, to)) {
    return { ok: false, reason: `Cannot move a reminder from ${from} to ${to}`, state: from };
  }
  return { ok: true, state: to };
}

/**
 * The state a reminder should be in right now, given only the clock.
 *
 * Used when the timeline is rebuilt — for instance after a restart — so a
 * reminder whose window elapsed while the phone was off is shown correctly.
 */
export function derivedState(
  current: ReminderState,
  dueAt: Date,
  missedAfterMinutes: number,
  now = new Date(),
): ReminderState {
  // A patient's own action always wins over the clock.
  if (current === "ACKNOWLEDGED" || current === "HELP_REQUESTED") return current;

  const missedAt = new Date(dueAt.getTime() + missedAfterMinutes * 60 * 1000);
  if (now >= missedAt) return "MISSED";
  if (now >= dueAt) return current === "SNOOZED" ? "SNOOZED" : "DUE";
  return "UPCOMING";
}

/** Whether a reminder still wants the patient's attention. */
export function isOutstanding(state: ReminderState): boolean {
  return state === "DUE" || state === "SNOOZED" || state === "MISSED";
}

export function isSettled(state: ReminderState): boolean {
  return state === "ACKNOWLEDGED";
}

/** Translation key describing a state to the patient — always encouraging. */
export function stateMessageKey(state: ReminderState): string {
  const keys: Record<ReminderState, string> = {
    UPCOMING: "myDay.upcoming",
    DUE: "myDay.due",
    ACKNOWLEDGED: "myDay.acknowledged",
    SNOOZED: "myDay.snoozed",
    MISSED: "myDay.missed",
    HELP_REQUESTED: "help.sent",
  };
  return keys[state];
}
