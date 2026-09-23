import type { ReminderState, SupportedLanguage } from "@smritisetu/shared-types";
import { ReminderRepository, ScheduleRepository } from "../db/repositories";
import { eventQueue } from "../sync/eventQueue";
import { newEventId } from "../utils/id";
import { endOfDay, startOfDay } from "../utils/datetime";
import { notificationService } from "./notificationService";
import {
  mergeWithStored,
  nextReminder,
  planRemindersForDay,
  snoozedUntil,
  type PlannedReminder,
} from "./reminderScheduler";
import { transition } from "./reminderState";

export type TimelineItem = PlannedReminder & {
  eventId: string;
  state: ReminderState;
  snoozeCount: number;
  notificationId?: string | null;
};

/**
 * Builds today's timeline and keeps local notifications in step with it.
 *
 * `rebuild` is idempotent and is called on every launch — which is exactly what
 * makes reminders survive a device restart or a schedule change: the plan is
 * recomputed from the cached schedules, existing patient actions are preserved,
 * and notifications are re-registered from scratch.
 */
export const reminderManager = {
  async rebuild(
    patientId: string,
    deviceId: string,
    language: SupportedLanguage,
    labelFor: (item: PlannedReminder) => { title: string; body: string },
    day = new Date(),
  ): Promise<TimelineItem[]> {
    const schedules = await new ScheduleRepository().listActive(patientId);
    const reminders = new ReminderRepository();

    const stored = await reminders.listForDay(
      patientId,
      startOfDay(day).toISOString(),
      endOfDay(day).toISOString(),
    );
    const merged = mergeWithStored(planRemindersForDay(schedules, day), stored, new Date());

    // Rebuild the OS-level schedule from nothing so a removed or edited
    // schedule cannot leave a stale reminder behind.
    await notificationService.cancelAll();

    const timeline: TimelineItem[] = [];
    for (const item of merged) {
      const eventId = item.existing?.eventId ?? newEventId();
      let notificationId: string | null = null;

      const needsNotification = item.state === "UPCOMING" && item.dueAt.getTime() > Date.now();
      if (needsNotification) {
        const label = labelFor(item);
        notificationId = await notificationService.scheduleReminder(
          item,
          eventId,
          language,
          label.title,
          label.body,
        );
      }

      // A reminder whose window elapsed while the phone was off becomes MISSED
      // here, and that transition is queued for the caregiver.
      const previousState = item.existing?.state;
      if (!item.existing || previousState !== item.state) {
        await eventQueue.recordReminderState({
          eventId: !item.existing ? eventId : newEventId(),
          patientId,
          deviceId,
          scheduleId: item.scheduleId,
          scheduleVersion: item.scheduleVersion,
          kind: item.kind,
          critical: item.critical,
          dueAt: item.dueAt.toISOString(),
          state: item.state,
          stateChangedAt: new Date().toISOString(),
          snoozeCount: item.existing?.snoozeCount ?? 0,
          helpRequested: item.existing?.helpRequested ?? false,
          notificationId,
        });
      }

      await new ReminderRepository().upsert({
        eventId,
        patientId,
        deviceId,
        scheduleId: item.scheduleId,
        scheduleVersion: item.scheduleVersion,
        kind: item.kind,
        critical: item.critical,
        dueAt: item.dueAt.toISOString(),
        state: item.state,
        stateChangedAt: new Date().toISOString(),
        snoozeCount: item.existing?.snoozeCount ?? 0,
        helpRequested: item.existing?.helpRequested ?? false,
        syncStatus: "PENDING",
        notificationId,
      });

      timeline.push({
        ...item,
        eventId,
        state: item.state,
        snoozeCount: item.existing?.snoozeCount ?? 0,
        notificationId,
      });
    }

    return timeline;
  },

  /**
   * Records that the patient pressed Done.
   *
   * This is an acknowledgement of the reminder, never a claim that the medicine
   * was consumed — the wording is fixed here and in every message it produces.
   */
  async acknowledge(item: TimelineItem, patientId: string, deviceId: string): Promise<ReminderState> {
    return this.changeState(item, "ACKNOWLEDGED", patientId, deviceId);
  },

  async snooze(
    item: TimelineItem,
    patientId: string,
    deviceId: string,
    labelFor: (item: PlannedReminder) => { title: string; body: string },
    language: SupportedLanguage,
  ): Promise<{ state: ReminderState; nextDueAt: Date }> {
    const result = transition(item.state, "SNOOZED");
    const nextDueAt = snoozedUntil(item.dueAt, item.snoozeMinutes);

    if (result.ok) {
      await notificationService.cancel(item.notificationId);
      const label = labelFor(item);
      const notificationId = await notificationService.scheduleReminder(
        { ...item, dueAt: nextDueAt },
        item.eventId,
        language,
        label.title,
        label.body,
      );

      await eventQueue.recordReminderState({
        eventId: newEventId(),
        patientId,
        deviceId,
        scheduleId: item.scheduleId,
        scheduleVersion: item.scheduleVersion,
        kind: item.kind,
        critical: item.critical,
        dueAt: item.dueAt.toISOString(),
        state: "SNOOZED",
        stateChangedAt: new Date().toISOString(),
        snoozeCount: item.snoozeCount + 1,
        helpRequested: false,
      });

      await new ReminderRepository().upsert({
        eventId: item.eventId,
        patientId,
        deviceId,
        scheduleId: item.scheduleId,
        scheduleVersion: item.scheduleVersion,
        kind: item.kind,
        critical: item.critical,
        dueAt: item.dueAt.toISOString(),
        state: "SNOOZED",
        stateChangedAt: new Date().toISOString(),
        snoozeCount: item.snoozeCount + 1,
        helpRequested: false,
        syncStatus: "PENDING",
        notificationId,
      });
    }

    return { state: result.state, nextDueAt };
  },

  async requestHelp(item: TimelineItem, patientId: string, deviceId: string): Promise<ReminderState> {
    await eventQueue.recordHelpRequest({
      patientId,
      deviceId,
      context: `reminder:${item.kind}`,
      scheduleId: item.scheduleId,
    });
    return this.changeState(item, "HELP_REQUESTED", patientId, deviceId);
  },

  async changeState(
    item: TimelineItem,
    to: ReminderState,
    patientId: string,
    deviceId: string,
  ): Promise<ReminderState> {
    const result = transition(item.state, to);
    if (!result.ok) return item.state;

    await notificationService.cancel(item.notificationId);

    await eventQueue.recordReminderState({
      eventId: newEventId(),
      patientId,
      deviceId,
      scheduleId: item.scheduleId,
      scheduleVersion: item.scheduleVersion,
      kind: item.kind,
      critical: item.critical,
      dueAt: item.dueAt.toISOString(),
      state: to,
      stateChangedAt: new Date().toISOString(),
      snoozeCount: item.snoozeCount,
      helpRequested: to === "HELP_REQUESTED",
    });

    await new ReminderRepository().upsert({
      eventId: item.eventId,
      patientId,
      deviceId,
      scheduleId: item.scheduleId,
      scheduleVersion: item.scheduleVersion,
      kind: item.kind,
      critical: item.critical,
      dueAt: item.dueAt.toISOString(),
      state: to,
      stateChangedAt: new Date().toISOString(),
      snoozeCount: item.snoozeCount,
      helpRequested: to === "HELP_REQUESTED",
      syncStatus: "PENDING",
      notificationId: null,
    });

    return to;
  },

  nextUp: nextReminder,
};
