import type { ReminderEvent, ReminderState, ScheduleKind } from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

type Row = {
  event_id: string;
  patient_id: string;
  device_id: string;
  schedule_id: string;
  schedule_version: number;
  kind: string;
  critical: number;
  due_at: string;
  state: string;
  state_changed_at: string;
  snooze_count: number;
  help_requested: number;
  notification_id: string | null;
  sync_status: string;
};

/**
 * Reminder history is append-only in the sense that every state change is
 * *recorded*; the current state of one occurrence is kept on a single row keyed
 * by (schedule, dueAt), while each transition is queued to the server as its
 * own immutable event.
 */
/** A reminder plus the id of the local notification scheduled for it. */
export type StoredReminder = ReminderEvent & { notificationId: string | null };

export class ReminderRepository extends BaseRepository {
  async upsert(event: ReminderEvent & { notificationId?: string | null }): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO reminder_events (
         event_id, patient_id, device_id, schedule_id, schedule_version, kind, critical,
         due_at, state, state_changed_at, snooze_count, help_requested, notification_id, sync_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id) DO UPDATE SET
         state = excluded.state,
         state_changed_at = excluded.state_changed_at,
         snooze_count = excluded.snooze_count,
         help_requested = excluded.help_requested,
         notification_id = excluded.notification_id,
         sync_status = excluded.sync_status`,
      [
        event.eventId,
        event.patientId,
        event.deviceId,
        event.scheduleId,
        event.scheduleVersion,
        event.kind,
        this.toInt(event.critical),
        event.dueAt,
        event.state,
        event.stateChangedAt,
        event.snoozeCount,
        this.toInt(event.helpRequested),
        event.notificationId ?? null,
        event.syncStatus,
      ],
    );
  }

  /** The row representing one occurrence of one schedule, if it exists yet. */
  async findOccurrence(scheduleId: string, dueAt: string): Promise<StoredReminder | null> {
    const row = await this.db.getFirstAsync<Row>(
      "SELECT * FROM reminder_events WHERE schedule_id = ? AND due_at = ? ORDER BY state_changed_at DESC LIMIT 1",
      [scheduleId, dueAt],
    );
    return row ? this.toEvent(row) : null;
  }

  async findById(eventId: string): Promise<StoredReminder | null> {
    const row = await this.db.getFirstAsync<Row>(
      "SELECT * FROM reminder_events WHERE event_id = ?",
      [eventId],
    );
    return row ? this.toEvent(row) : null;
  }

  async listForDay(patientId: string, dayStartIso: string, dayEndIso: string): Promise<StoredReminder[]> {
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM reminder_events
       WHERE patient_id = ? AND due_at >= ? AND due_at < ?
       ORDER BY due_at ASC`,
      [patientId, dayStartIso, dayEndIso],
    );
    return rows.map((row) => this.toEvent(row));
  }

  async countMissedForSchedule(scheduleId: string, sinceIso: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM reminder_events WHERE schedule_id = ? AND state = 'MISSED' AND due_at >= ?",
      [scheduleId, sinceIso],
    );
    return row?.count ?? 0;
  }

  async setNotificationId(eventId: string, notificationId: string | null): Promise<void> {
    await this.db.runAsync("UPDATE reminder_events SET notification_id = ? WHERE event_id = ?", [
      notificationId,
      eventId,
    ]);
  }

  async markSynced(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(
      `UPDATE reminder_events SET sync_status = 'SYNCED' WHERE event_id IN (${placeholders})`,
      eventIds,
    );
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM reminder_events");
  }

  private toEvent(row: Row): StoredReminder {
    return {
      eventId: row.event_id,
      patientId: row.patient_id,
      deviceId: row.device_id,
      scheduleId: row.schedule_id,
      scheduleVersion: row.schedule_version,
      kind: row.kind as ScheduleKind,
      critical: this.bool(row.critical),
      dueAt: row.due_at,
      state: row.state as ReminderState,
      stateChangedAt: row.state_changed_at,
      snoozeCount: row.snooze_count,
      helpRequested: this.bool(row.help_requested),
      notificationId: row.notification_id,
      syncStatus: row.sync_status as ReminderEvent["syncStatus"],
    };
  }
}
