import type { Schedule, ScheduleKind, ScheduleOccurrenceTime } from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

type Row = {
  schedule_id: string;
  patient_id: string;
  kind: string;
  title_en: string;
  title_as: string | null;
  detail: string | null;
  critical: number;
  occurrences: string;
  missed_after_minutes: number;
  snooze_minutes: number;
  version: number;
  active: number;
  updated_at: string;
};

export class ScheduleRepository extends BaseRepository {
  /** Replaces the cached plan wholesale — the server is the source of truth. */
  async replaceAll(patientId: string, schedules: Schedule[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync("DELETE FROM schedules WHERE patient_id = ?", [patientId]);
      for (const schedule of schedules) {
        await this.db.runAsync(
          `INSERT INTO schedules (
             schedule_id, patient_id, kind, title_en, title_as, detail, critical,
             occurrences, missed_after_minutes, snooze_minutes, version, active, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            schedule.scheduleId,
            patientId,
            schedule.kind,
            schedule.titleEn,
            schedule.titleAs ?? null,
            schedule.detail ?? null,
            this.toInt(schedule.critical),
            JSON.stringify(schedule.occurrences ?? []),
            schedule.missedAfterMinutes,
            schedule.snoozeMinutes,
            schedule.version,
            this.toInt(schedule.active),
            schedule.updatedAt,
          ],
        );
      }
    });
  }

  async listActive(patientId: string): Promise<Schedule[]> {
    const rows = await this.db.getAllAsync<Row>(
      "SELECT * FROM schedules WHERE patient_id = ? AND active = 1 ORDER BY schedule_id",
      [patientId],
    );
    return rows.map((row) => this.toSchedule(row));
  }

  async findById(scheduleId: string): Promise<Schedule | null> {
    const row = await this.db.getFirstAsync<Row>(
      "SELECT * FROM schedules WHERE schedule_id = ?",
      [scheduleId],
    );
    return row ? this.toSchedule(row) : null;
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM schedules");
  }

  private toSchedule(row: Row): Schedule {
    return {
      scheduleId: row.schedule_id,
      patientId: row.patient_id,
      kind: row.kind as ScheduleKind,
      titleKey: `myDay.kind.${row.kind}`,
      titleEn: row.title_en,
      titleAs: row.title_as ?? undefined,
      detail: row.detail ?? undefined,
      critical: this.bool(row.critical),
      occurrences: this.json<ScheduleOccurrenceTime[]>(row.occurrences, []),
      missedAfterMinutes: row.missed_after_minutes,
      snoozeMinutes: row.snooze_minutes,
      version: row.version,
      active: this.bool(row.active),
      updatedAt: row.updated_at,
    };
  }
}
