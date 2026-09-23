import type { GameSessionDetail, GameSessionEvent, GameType } from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

type Row = {
  event_id: string;
  patient_id: string;
  device_id: string;
  game_type: string;
  difficulty: number;
  accuracy: number | null;
  response_time_seconds: number;
  hints_used: number;
  attempts: number;
  completed: number;
  abandoned: number;
  engagement_duration_seconds: number;
  played_at: string;
  detail: string | null;
  sync_status: string;
};

/** A stored session plus its game-specific detail. */
export type StoredGameSession = GameSessionEvent & { detail: GameSessionDetail };

export class GameSessionRepository extends BaseRepository {
  /**
   * Inserts a session. The primary key is the client-generated eventId, so a
   * double-tap on "Finish" can never create two rows for the same session.
   */
  async insert(session: GameSessionEvent, detail?: GameSessionDetail): Promise<void> {
    await this.db.runAsync(
      `INSERT OR IGNORE INTO game_sessions (
         event_id, patient_id, device_id, game_type, difficulty, accuracy,
         response_time_seconds, hints_used, attempts, completed, abandoned,
         engagement_duration_seconds, played_at, detail, sync_status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.eventId,
        session.patientId,
        session.deviceId,
        session.gameType,
        session.difficulty,
        session.accuracy,
        session.responseTimeSeconds,
        session.hintsUsed,
        session.attempts,
        this.toInt(session.completed),
        this.toInt(session.abandoned),
        session.engagementDurationSeconds,
        session.playedAt,
        detail ? JSON.stringify(detail) : null,
        session.syncStatus,
      ],
    );
  }

  async findById(eventId: string): Promise<StoredGameSession | null> {
    const row = await this.db.getFirstAsync<Row>(
      "SELECT * FROM game_sessions WHERE event_id = ?",
      [eventId],
    );
    return row ? this.toSession(row) : null;
  }

  async listRecent(patientId: string, limit = 20, gameType?: GameType): Promise<StoredGameSession[]> {
    const rows = gameType
      ? await this.db.getAllAsync<Row>(
          "SELECT * FROM game_sessions WHERE patient_id = ? AND game_type = ? ORDER BY played_at DESC, rowid DESC LIMIT ?",
          [patientId, gameType, limit],
        )
      : await this.db.getAllAsync<Row>(
          "SELECT * FROM game_sessions WHERE patient_id = ? ORDER BY played_at DESC, rowid DESC LIMIT ?",
          [patientId, limit],
        );
    return rows.map((row) => this.toSession(row));
  }

  async countPending(patientId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM game_sessions WHERE patient_id = ? AND sync_status = 'PENDING'",
      [patientId],
    );
    return row?.count ?? 0;
  }

  async markSynced(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    const placeholders = eventIds.map(() => "?").join(", ");
    await this.db.runAsync(
      `UPDATE game_sessions SET sync_status = 'SYNCED' WHERE event_id IN (${placeholders})`,
      eventIds,
    );
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM game_sessions");
  }

  private toSession(row: Row): StoredGameSession {
    return {
      eventId: row.event_id,
      patientId: row.patient_id,
      deviceId: row.device_id,
      gameType: row.game_type as GameType,
      difficulty: row.difficulty,
      accuracy: row.accuracy,
      responseTimeSeconds: row.response_time_seconds,
      hintsUsed: row.hints_used,
      attempts: row.attempts,
      completed: this.bool(row.completed),
      abandoned: this.bool(row.abandoned),
      engagementDurationSeconds: row.engagement_duration_seconds,
      playedAt: row.played_at,
      syncStatus: row.sync_status as GameSessionEvent["syncStatus"],
      detail: this.json<GameSessionDetail>(row.detail, {}),
    };
  }
}
