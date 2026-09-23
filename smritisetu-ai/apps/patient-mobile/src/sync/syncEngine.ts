import type {
  SyncEventEnvelope,
  SyncEventType,
  SyncQueueItem,
  SyncResponse,
} from "@smritisetu/shared-types";
import { CURRENT_PAYLOAD_VERSION } from "@smritisetu/shared-types";
import { ApiRequestError, NetworkError } from "../api/errors";
import {
  DeviceRepository,
  GameSessionRepository,
  ReminderRepository,
  SyncQueueRepository,
} from "../db/repositories";
import { isReadyToRetry } from "./backoff";

export const BATCH_SIZE = 50;

export type SyncOutcome = {
  ran: boolean;
  accepted: number;
  duplicates: number;
  rejected: number;
  conflicts: number;
  remaining: number;
  error?: string;
  needsRepair?: boolean;
  nextPackageVersion?: number;
};

export type SyncDependencies = {
  queue: SyncQueueRepository;
  devices: DeviceRepository;
  games: GameSessionRepository;
  reminders: ReminderRepository;
  push: (events: SyncEventEnvelope[], clientPackageVersion: number) => Promise<SyncResponse>;
  now?: () => number;
};

/**
 * Pushes queued offline events to the server.
 *
 * Guarantees:
 *  * events are sent in creation order, in batches
 *  * an event is deleted locally only once the server has confirmed it —
 *    accepted or already-known both count as confirmed
 *  * a failure keeps the data and backs off exponentially
 *  * partial success is handled per event, not per batch
 *  * a duplicate can never be created, because the event id is the queue's
 *    primary key on the device and is unique per device on the server
 *  * the patient is never blocked: this runs in the background and its result
 *    only ever updates a status line
 */
export async function runSync(deps: SyncDependencies): Promise<SyncOutcome> {
  const { queue, devices, games, reminders, push } = deps;
  const now = deps.now ?? Date.now;

  const empty: SyncOutcome = {
    ran: false,
    accepted: 0,
    duplicates: 0,
    rejected: 0,
    conflicts: 0,
    remaining: 0,
  };

  // Anything left SYNCING by a crash is returned to the queue first.
  await queue.recoverInFlight();

  const pending = await queue.nextBatch(BATCH_SIZE);
  if (pending.length === 0) {
    return { ...empty, remaining: await queue.countPending() };
  }

  // Respect the backoff for items that already failed.
  const ready = pending.filter((item) =>
    item.retryCount === 0 ? true : isReadyToRetry(item.retryCount, item.lastAttemptAt, now()),
  );
  if (ready.length === 0) {
    return { ...empty, remaining: await queue.countPending() };
  }

  const device = await devices.get();
  const clientPackageVersion = device?.packageVersion ?? 0;

  const envelopes = ready.map(toEnvelope).filter((e): e is SyncEventEnvelope => e !== null);
  if (envelopes.length === 0) {
    // Every item failed to parse — park them rather than looping.
    await queue.markRejected(ready.map((i) => i.eventId), "MALFORMED_LOCAL_PAYLOAD");
    return { ...empty, ran: true, rejected: ready.length, remaining: await queue.countPending() };
  }

  const inFlight = envelopes.map((e) => e.eventId);
  await queue.markSyncing(inFlight);

  let response: SyncResponse;
  try {
    response = await push(envelopes, clientPackageVersion);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (error instanceof ApiRequestError && error.needsRepair) {
      // The device token is no longer valid. Nothing is discarded — the events
      // wait for the device to be paired again.
      await queue.markFailed(inFlight, "SESSION_EXPIRED");
      await devices.markSyncFailed("SESSION_EXPIRED");
      return {
        ...empty,
        ran: true,
        error: "SESSION_EXPIRED",
        needsRepair: true,
        remaining: await queue.countPending(),
      };
    }

    if (error instanceof ApiRequestError && !error.isRetryable) {
      // A 4xx that will never succeed for this batch: park it for support
      // rather than retrying forever.
      await queue.markRejected(inFlight, `${error.code}: ${error.message}`);
      await devices.markSyncFailed(message);
      return {
        ...empty,
        ran: true,
        rejected: inFlight.length,
        error: error.code,
        remaining: await queue.countPending(),
      };
    }

    // Offline, timeout or a server-side problem: keep everything and retry.
    // A stable code rather than a platform-specific message, so the sync-status
    // screen can tell "you are offline" apart from "something went wrong".
    const code = error instanceof NetworkError ? "OFFLINE" : message;
    await queue.markFailed(inFlight, code);
    await devices.markSyncFailed(message);
    return { ...empty, ran: true, error: code, remaining: await queue.countPending() };
  }

  // --- Partial success handling ------------------------------------------
  const confirmed = [...response.accepted, ...response.duplicates];
  await queue.markSynced(confirmed);
  await markDomainRowsSynced(confirmed, ready, games, reminders);

  const rejectedIds = response.rejected.map((r) => r.eventId);
  if (rejectedIds.length > 0) {
    const reason = response.rejected.map((r) => `${r.eventId}:${r.code}`).join("; ");
    await queue.markRejected(rejectedIds, reason);
  }

  const conflictIds = response.conflicts.map((c) => c.eventId);
  if (conflictIds.length > 0) {
    // A conflicting medicine or routine schedule is never resolved silently on
    // the device; it is parked for a caregiver to reconcile.
    await queue.markConflict(conflictIds);
  }

  // Anything the server did not mention stays queued for the next attempt.
  const acknowledged = new Set([...confirmed, ...rejectedIds, ...conflictIds]);
  const unacknowledged = inFlight.filter((id) => !acknowledged.has(id));
  if (unacknowledged.length > 0) {
    await queue.markFailed(unacknowledged, "NOT_ACKNOWLEDGED_BY_SERVER");
  }

  await devices.markSynced(response.serverTime);
  if (response.nextPackageVersion !== undefined) {
    await devices.setPackageVersion(clientPackageVersion);
  }

  return {
    ran: true,
    accepted: response.accepted.length,
    duplicates: response.duplicates.length,
    rejected: response.rejected.length,
    conflicts: response.conflicts.length,
    remaining: await queue.countPending(),
    nextPackageVersion: response.nextPackageVersion,
  };
}

function toEnvelope(item: SyncQueueItem): SyncEventEnvelope | null {
  try {
    const payload = JSON.parse(item.payload) as Record<string, unknown>;
    const timestamp =
      typeof payload.playedAt === "string"
        ? payload.playedAt
        : typeof payload.stateChangedAt === "string"
          ? payload.stateChangedAt
          : item.localCreatedAt;

    return {
      eventId: item.eventId,
      patientId: item.patientId,
      deviceId: item.deviceId,
      eventType: item.eventType as SyncEventType,
      eventTimestamp: timestamp,
      payloadVersion: CURRENT_PAYLOAD_VERSION,
      localCreatedAt: item.localCreatedAt,
      payload,
    };
  } catch {
    return null;
  }
}

async function markDomainRowsSynced(
  confirmedIds: string[],
  batch: SyncQueueItem[],
  games: GameSessionRepository,
  reminders: ReminderRepository,
): Promise<void> {
  if (confirmedIds.length === 0) return;
  const confirmed = new Set(confirmedIds);
  const byType = new Map<string, string[]>();

  for (const item of batch) {
    if (!confirmed.has(item.eventId)) continue;
    const list = byType.get(item.eventType) ?? [];
    list.push(item.eventId);
    byType.set(item.eventType, list);
  }

  await games.markSynced(byType.get("GAME_SESSION") ?? []);
  await reminders.markSynced(byType.get("REMINDER_EVENT") ?? []);
}
