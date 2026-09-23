import type {
  GameSessionDetail,
  GameSessionEvent,
  ReminderEvent,
} from "@smritisetu/shared-types";
import { GameSessionRepository, ReminderRepository, SyncQueueRepository } from "../db/repositories";
import { newEventId } from "../utils/id";

/**
 * Writes an event to its own table *and* to the sync queue, in one transaction
 * conceptually: the local record is the source of truth and the queue entry is
 * the promise to tell the server about it. Nothing is ever sent without first
 * being stored locally, so a crash mid-send loses nothing.
 */
export const eventQueue = {
  async recordGameSession(
    session: Omit<GameSessionEvent, "eventId" | "syncStatus"> & { eventId?: string },
    detail?: GameSessionDetail,
  ): Promise<string> {
    const eventId = session.eventId ?? newEventId();
    const full: GameSessionEvent = { ...session, eventId, syncStatus: "PENDING" };

    await new GameSessionRepository().insert(full, detail);
    await new SyncQueueRepository().enqueue({
      eventId,
      eventType: "GAME_SESSION",
      payload: JSON.stringify({
        gameType: full.gameType,
        difficulty: full.difficulty,
        accuracy: full.accuracy,
        responseTimeSeconds: full.responseTimeSeconds,
        hintsUsed: full.hintsUsed,
        attempts: full.attempts,
        completed: full.completed,
        abandoned: full.abandoned,
        engagementDurationSeconds: full.engagementDurationSeconds,
        playedAt: full.playedAt,
        detail: detail ?? {},
      }),
      patientId: full.patientId,
      deviceId: full.deviceId,
      localCreatedAt: new Date().toISOString(),
    });

    return eventId;
  },

  /**
   * Records a reminder state change.
   *
   * The local row is keyed by the occurrence so the timeline shows one card per
   * reminder, while each transition is queued to the server as its own event —
   * reminder history on the server is append-only.
   */
  async recordReminderState(
    event: Omit<ReminderEvent, "syncStatus"> & { notificationId?: string | null },
  ): Promise<string> {
    const full: ReminderEvent & { notificationId?: string | null } = {
      ...event,
      syncStatus: "PENDING",
    };

    await new ReminderRepository().upsert(full);
    await new SyncQueueRepository().enqueue({
      // A transition gets its own queue id so the server receives every step.
      eventId: event.eventId,
      eventType: "REMINDER_EVENT",
      payload: JSON.stringify({
        scheduleId: full.scheduleId,
        scheduleVersion: full.scheduleVersion,
        dueAt: full.dueAt,
        state: full.state,
        stateChangedAt: full.stateChangedAt,
        snoozeCount: full.snoozeCount,
        helpRequested: full.helpRequested,
      }),
      patientId: full.patientId,
      deviceId: full.deviceId,
      localCreatedAt: new Date().toISOString(),
    });

    return full.eventId;
  },

  async recordHelpRequest(input: {
    patientId: string;
    deviceId: string;
    context?: string;
    scheduleId?: string;
  }): Promise<string> {
    const eventId = newEventId();
    const requestedAt = new Date().toISOString();

    await new SyncQueueRepository().enqueue({
      eventId,
      eventType: "HELP_REQUEST",
      payload: JSON.stringify({
        requestedAt,
        context: input.context ?? "app",
        scheduleId: input.scheduleId,
      }),
      patientId: input.patientId,
      deviceId: input.deviceId,
      localCreatedAt: requestedAt,
    });

    return eventId;
  },

  async recordMemoryEngagement(input: {
    patientId: string;
    deviceId: string;
    memoryIds: string[];
    audioPlayedCount: number;
    engagementDurationSeconds: number;
  }): Promise<string> {
    const eventId = newEventId();
    const viewedAt = new Date().toISOString();

    await new SyncQueueRepository().enqueue({
      eventId,
      eventType: "MEMORY_ENGAGEMENT",
      payload: JSON.stringify({ ...input, viewedAt }),
      patientId: input.patientId,
      deviceId: input.deviceId,
      localCreatedAt: viewedAt,
    });

    return eventId;
  },
};
