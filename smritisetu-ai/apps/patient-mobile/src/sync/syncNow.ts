import { apiClient } from "../api/client";
import {
  DeviceRepository,
  GameSessionRepository,
  ReminderRepository,
  SyncQueueRepository,
} from "../db/repositories";
import { runSync, type SyncOutcome } from "./syncEngine";

/**
 * Wires the pure sync engine to the real repositories and API client.
 *
 * Kept separate from syncEngine.ts so the engine itself has no Expo or network
 * imports and can be tested against real SQLite in plain Node.
 */
export async function syncNow(): Promise<SyncOutcome> {
  return runSync({
    queue: new SyncQueueRepository(),
    devices: new DeviceRepository(),
    games: new GameSessionRepository(),
    reminders: new ReminderRepository(),
    push: (events, version) => apiClient.pushEvents(events, version),
  });
}
