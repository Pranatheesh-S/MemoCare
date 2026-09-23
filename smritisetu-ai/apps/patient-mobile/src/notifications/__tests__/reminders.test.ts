import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReminderEvent, Schedule } from "@smritisetu/shared-types";
import {
  ALLOWED_TRANSITIONS,
  canTransition,
  derivedState,
  isOutstanding,
  isSettled,
  stateMessageKey,
  transition,
} from "../reminderState";
import {
  mergeWithStored,
  nextReminder,
  planRemindersForDay,
  snoozedUntil,
  upcomingOnly,
} from "../reminderScheduler";

const PATIENT = "11111111-1111-4111-8111-111111111111";
const everyDay = [0, 1, 2, 3, 4, 5, 6];

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    scheduleId: "sched-medicine",
    patientId: PATIENT,
    kind: "MEDICINE",
    titleKey: "myDay.kind.MEDICINE",
    titleEn: "Evening tablet",
    critical: true,
    occurrences: [{ timeOfDay: "20:00", daysOfWeek: everyDay }],
    missedAfterMinutes: 45,
    snoozeMinutes: 10,
    version: 1,
    active: true,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function localDate(year: number, month: number, day: number, hour: number, minute = 0): Date {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

describe("reminder state transitions", () => {
  it("allows the everyday path from upcoming to acknowledged", () => {
    assert.equal(canTransition("UPCOMING", "DUE"), true);
    assert.equal(canTransition("DUE", "ACKNOWLEDGED"), true);
    assert.equal(canTransition("DUE", "SNOOZED"), true);
    assert.equal(canTransition("SNOOZED", "ACKNOWLEDGED"), true);
  });

  it("lets a patient still mark a missed reminder as done", () => {
    assert.equal(canTransition("MISSED", "ACKNOWLEDGED"), true);
  });

  it("treats acknowledged as final", () => {
    assert.deepEqual(ALLOWED_TRANSITIONS.ACKNOWLEDGED, []);
    assert.equal(canTransition("ACKNOWLEDGED", "MISSED"), false);
    assert.equal(canTransition("ACKNOWLEDGED", "DUE"), false);
  });

  it("refuses an impossible transition without changing state", () => {
    const result = transition("ACKNOWLEDGED", "MISSED");
    assert.equal(result.ok, false);
    assert.equal(result.state, "ACKNOWLEDGED");
  });

  it("treats a transition to the same state as a no-op success", () => {
    const result = transition("DUE", "DUE");
    assert.equal(result.ok, true);
  });

  it("allows help to be requested from any active state", () => {
    for (const state of ["UPCOMING", "DUE", "SNOOZED", "MISSED"] as const) {
      assert.equal(canTransition(state, "HELP_REQUESTED"), true, `from ${state}`);
    }
  });

  it("classifies states for the timeline", () => {
    assert.equal(isOutstanding("DUE"), true);
    assert.equal(isOutstanding("MISSED"), true);
    assert.equal(isOutstanding("ACKNOWLEDGED"), false);
    assert.equal(isSettled("ACKNOWLEDGED"), true);
  });

  it("has an encouraging message for every state", () => {
    for (const state of ["UPCOMING", "DUE", "ACKNOWLEDGED", "SNOOZED", "MISSED", "HELP_REQUESTED"] as const) {
      assert.ok(stateMessageKey(state).length > 0);
    }
    // "Missed" is never phrased as a failure to the patient.
    assert.equal(stateMessageKey("MISSED"), "myDay.missed");
  });
});

describe("derived state from the clock", () => {
  const dueAt = localDate(2026, 8, 25, 20, 0);

  it("is upcoming before the due time", () => {
    assert.equal(derivedState("UPCOMING", dueAt, 45, localDate(2026, 8, 25, 19, 0)), "UPCOMING");
  });

  it("becomes due at the due time", () => {
    assert.equal(derivedState("UPCOMING", dueAt, 45, localDate(2026, 8, 25, 20, 0)), "DUE");
  });

  it("stays due inside the window", () => {
    assert.equal(derivedState("UPCOMING", dueAt, 45, localDate(2026, 8, 25, 20, 30)), "DUE");
  });

  it("becomes missed once the window has passed", () => {
    assert.equal(derivedState("DUE", dueAt, 45, localDate(2026, 8, 25, 20, 46)), "MISSED");
  });

  it("never overrides an acknowledgement the patient already made", () => {
    assert.equal(
      derivedState("ACKNOWLEDGED", dueAt, 45, localDate(2026, 8, 26, 10, 0)),
      "ACKNOWLEDGED",
      "a completed reminder must never turn into MISSED later",
    );
  });

  it("never overrides a help request", () => {
    assert.equal(derivedState("HELP_REQUESTED", dueAt, 45, localDate(2026, 8, 26, 10, 0)), "HELP_REQUESTED");
  });

  it("keeps a snoozed reminder snoozed inside the window", () => {
    assert.equal(derivedState("SNOOZED", dueAt, 45, localDate(2026, 8, 25, 20, 20)), "SNOOZED");
  });
});

describe("planning a day", () => {
  const day = localDate(2026, 8, 25, 12, 0); // a Tuesday

  it("expands every occurrence of every active schedule", () => {
    const planned = planRemindersForDay(
      [
        schedule(),
        schedule({
          scheduleId: "sched-water",
          kind: "HYDRATION",
          critical: false,
          titleEn: "Drink water",
          occurrences: [
            { timeOfDay: "11:00", daysOfWeek: everyDay },
            { timeOfDay: "15:00", daysOfWeek: everyDay },
          ],
        }),
      ],
      day,
    );
    assert.equal(planned.length, 3);
  });

  it("returns reminders in time order", () => {
    const planned = planRemindersForDay(
      [
        schedule({ occurrences: [{ timeOfDay: "20:00", daysOfWeek: everyDay }] }),
        schedule({ scheduleId: "morning", occurrences: [{ timeOfDay: "08:00", daysOfWeek: everyDay }] }),
      ],
      day,
    );
    assert.deepEqual(planned.map((p) => p.scheduleId), ["morning", "sched-medicine"]);
  });

  it("skips a schedule that does not apply today", () => {
    // 2026-08-25 is a Tuesday (day 2); this schedule is Sundays only.
    const planned = planRemindersForDay([schedule({ occurrences: [{ timeOfDay: "10:00", daysOfWeek: [0] }] })], day);
    assert.equal(planned.length, 0);
  });

  it("treats an empty daysOfWeek as every day", () => {
    const planned = planRemindersForDay([schedule({ occurrences: [{ timeOfDay: "10:00", daysOfWeek: [] }] })], day);
    assert.equal(planned.length, 1);
  });

  it("ignores an inactive schedule", () => {
    assert.equal(planRemindersForDay([schedule({ active: false })], day).length, 0);
  });

  it("ignores a malformed time rather than crashing", () => {
    const planned = planRemindersForDay(
      [schedule({ occurrences: [{ timeOfDay: "not-a-time", daysOfWeek: everyDay }] })],
      day,
    );
    assert.equal(planned.length, 0);
  });

  it("selects only reminders still ahead", () => {
    const planned = planRemindersForDay(
      [
        schedule({ scheduleId: "past", occurrences: [{ timeOfDay: "08:00", daysOfWeek: everyDay }] }),
        schedule({ scheduleId: "future", occurrences: [{ timeOfDay: "20:00", daysOfWeek: everyDay }] }),
      ],
      day,
    );
    const upcoming = upcomingOnly(planned, localDate(2026, 8, 25, 12, 0));
    assert.deepEqual(upcoming.map((p) => p.scheduleId), ["future"]);
  });
});

describe("merging a plan with what the device already knows", () => {
  const day = localDate(2026, 8, 25, 12, 0);

  function storedEvent(state: ReminderEvent["state"], dueAt: Date): ReminderEvent {
    return {
      eventId: "existing-1",
      patientId: PATIENT,
      deviceId: "device-1",
      scheduleId: "sched-medicine",
      scheduleVersion: 1,
      kind: "MEDICINE",
      critical: true,
      dueAt: dueAt.toISOString(),
      state,
      stateChangedAt: new Date().toISOString(),
      snoozeCount: 0,
      helpRequested: false,
      syncStatus: "PENDING",
    };
  }

  it("keeps an acknowledgement across a rebuild", () => {
    const planned = planRemindersForDay([schedule()], day);
    const merged = mergeWithStored(
      planned,
      [storedEvent("ACKNOWLEDGED", planned[0].dueAt)],
      localDate(2026, 8, 25, 23, 0),
    );
    assert.equal(merged[0].state, "ACKNOWLEDGED", "a restart must not undo the patient's Done");
    assert.equal(merged[0].existing?.eventId, "existing-1");
  });

  it("turns an untouched elapsed reminder into missed after a restart", () => {
    const planned = planRemindersForDay([schedule()], day);
    const merged = mergeWithStored(
      planned,
      [storedEvent("UPCOMING", planned[0].dueAt)],
      localDate(2026, 8, 25, 23, 0),
    );
    assert.equal(merged[0].state, "MISSED");
  });

  it("treats a reminder with no stored row as new", () => {
    const planned = planRemindersForDay([schedule()], day);
    const merged = mergeWithStored(planned, [], localDate(2026, 8, 25, 12, 0));
    assert.equal(merged[0].existing, undefined);
    assert.equal(merged[0].state, "UPCOMING");
  });
});

describe("next reminder for the home screen", () => {
  const day = localDate(2026, 8, 25, 12, 0);

  it("picks the earliest outstanding reminder", () => {
    const planned = planRemindersForDay(
      [
        schedule({ scheduleId: "evening", occurrences: [{ timeOfDay: "20:00", daysOfWeek: everyDay }] }),
        schedule({ scheduleId: "afternoon", occurrences: [{ timeOfDay: "15:00", daysOfWeek: everyDay }] }),
      ],
      day,
    );
    const merged = planned.map((p) => ({ ...p, state: "UPCOMING" as const }));
    assert.equal(nextReminder(merged, localDate(2026, 8, 25, 12, 0))?.scheduleId, "afternoon");
  });

  it("skips reminders the patient has already marked done", () => {
    const planned = planRemindersForDay(
      [
        schedule({ scheduleId: "afternoon", occurrences: [{ timeOfDay: "15:00", daysOfWeek: everyDay }] }),
        schedule({ scheduleId: "evening", occurrences: [{ timeOfDay: "20:00", daysOfWeek: everyDay }] }),
      ],
      day,
    );
    const merged = [
      { ...planned[0], state: "ACKNOWLEDGED" as const },
      { ...planned[1], state: "UPCOMING" as const },
    ];
    assert.equal(nextReminder(merged, localDate(2026, 8, 25, 12, 0))?.scheduleId, "evening");
  });

  it("returns null when the day is complete", () => {
    const planned = planRemindersForDay([schedule()], day);
    const merged = planned.map((p) => ({ ...p, state: "ACKNOWLEDGED" as const }));
    assert.equal(nextReminder(merged, localDate(2026, 8, 25, 12, 0)), null);
  });
});

describe("snoozing", () => {
  it("pushes the reminder out by the configured minutes", () => {
    const dueAt = localDate(2026, 8, 25, 20, 0);
    const next = snoozedUntil(dueAt, 10, localDate(2026, 8, 25, 20, 0));
    assert.equal(next.getTime() - dueAt.getTime(), 10 * 60 * 1000);
  });

  it("measures from now when the reminder is already overdue", () => {
    const dueAt = localDate(2026, 8, 25, 20, 0);
    const now = localDate(2026, 8, 25, 20, 30);
    const next = snoozedUntil(dueAt, 10, now);
    assert.equal(next.getTime() - now.getTime(), 10 * 60 * 1000);
  });

  it("never pushes a reminder past the end of the day", () => {
    const dueAt = localDate(2026, 8, 25, 23, 50);
    const next = snoozedUntil(dueAt, 60, localDate(2026, 8, 25, 23, 50));
    assert.equal(next.getHours(), 23);
    assert.ok(next.getMinutes() <= 59);
    assert.equal(next.getDate(), 25, "a snooze must not spill into tomorrow");
  });
});
