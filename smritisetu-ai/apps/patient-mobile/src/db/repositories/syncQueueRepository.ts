import type { SyncQueueItem, SyncStatus } from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

type Row = {
  event_id: string;
  event_type: string;
  payload: string;
  patient_id: string;
  device_id: string;
  local_created_at: string;
  retry_count: number;
  last_attempt_at: string | null;
  last_error: string | null;
  status: string;
};

/** A queued item plus the last error, which the sync-status screen surfaces. */
export type QueuedItem = SyncQueueItem & { lastError?: string };

export class SyncQueueRepository extends BaseRepository {
  /**
   * Enqueues an event.
   *
   * INSERT OR IGNORE on the eventId primary key is what makes duplicate
   * prevention structural: enqueueing the same event twice — a retry, a
   * double-tap, a replayed notification action — cannot create a second row.
   */
  async enqueue(item: Omit<SyncQueueItem, "retryCount" | "status">): Promise<boolean> {
    const result = await this.db.runAsync(
      `INSERT OR IGNORE INTO sync_queue (
         event_id, event_type, payload, patient_id, device_id,
         local_created_at, retry_count, last_attempt_at, status
       ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, 'PENDING')`,
      [item.eventId, item.eventType, item.payload, item.patientId, item.deviceId, item.localCreatedAt],
    );
    return result.changes > 0;
  }

  /** Pending work in creation order — later events may depend on earlier ones. */
  async nextBatch(limit = 50): Promise<QueuedItem[]> {
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM sync_queue
       WHERE status IN ('PENDING', 'FAILED')
       ORDER BY local_created_at ASC, rowid ASC
       LIMIT ?`,
      [limit],
    );
    return rows.map((row) => this.toItem(row));
  }

  async markSyncing(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'SYNCING', last_attempt_at = ? WHERE event_id IN (${placeholders})`,
      [new Date().toISOString(), ...eventIds],
    );
  }

  /** Confirmed by the server — accepted or already known. Safe to drop. */
  async markSynced(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(`DELETE FROM sync_queue WHERE event_id IN (${placeholders})`, eventIds);
  }

  /**
   * Retryable failure. The item stays queued and its retry count grows, which
   * drives the exponential backoff.
   */
  async markFailed(eventIds: string[], error: string): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(
      `UPDATE sync_queue
       SET status = 'FAILED', retry_count = retry_count + 1, last_attempt_at = ?, last_error = ?
       WHERE event_id IN (${placeholders})`,
      [new Date().toISOString(), error.slice(0, 300), ...eventIds],
    );
  }

  /**
   * Permanently rejected by the server. Retrying cannot help, so the item is
   * parked rather than looping forever; it stays visible for support.
   */
  async markRejected(eventIds: string[], error: string): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'FAILED', retry_count = 99, last_error = ? WHERE event_id IN (${placeholders})`,
      [error.slice(0, 300), ...eventIds],
    );
  }

  async markConflict(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(
      `UPDATE sync_queue SET status = 'CONFLICT' WHERE event_id IN (${placeholders})`,
      eventIds,
    );
  }

  /** Releases anything stuck in SYNCING after a crash mid-flight. */
  async recoverInFlight(): Promise<number> {
    const result = await this.db.runAsync(
      "UPDATE sync_queue SET status = 'PENDING' WHERE status = 'SYNCING'",
    );
    return result.changes;
  }

  async countByStatus(): Promise<Record<SyncStatus, number>> {
    const rows = await this.db.getAllAsync<{ status: string; count: number }>(
      "SELECT status, COUNT(*) as count FROM sync_queue GROUP BY status",
    );
    const counts: Record<SyncStatus, number> = {
      PENDING: 0,
      SYNCING: 0,
      SYNCED: 0,
      FAILED: 0,
      CONFLICT: 0,
    };
    for (const row of rows) {
      counts[row.status as SyncStatus] = row.count;
    }
    return counts;
  }

  async countPending(): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('PENDING', 'SYNCING', 'FAILED')",
    );
    return row?.count ?? 0;
  }

  async has(eventId: string): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ event_id: string }>(
      "SELECT event_id FROM sync_queue WHERE event_id = ?",
      [eventId],
    );
    return row !== null;
  }

  async maxRetryCount(): Promise<number> {
    const row = await this.db.getFirstAsync<{ value: number | null }>(
      "SELECT MAX(retry_count) as value FROM sync_queue WHERE status IN ('PENDING', 'FAILED')",
    );
    return row?.value ?? 0;
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM sync_queue");
  }

  private toItem(row: Row): QueuedItem {
    return {
      eventId: row.event_id,
      eventType: row.event_type,
      payload: row.payload,
      patientId: row.patient_id,
      deviceId: row.device_id,
      localCreatedAt: row.local_created_at,
      retryCount: row.retry_count,
      lastAttemptAt: row.last_attempt_at ?? undefined,
      lastError: row.last_error ?? undefined,
      status: row.status as SyncStatus,
    };
  }
}
