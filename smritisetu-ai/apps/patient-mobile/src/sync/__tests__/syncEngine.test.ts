import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { SyncEventEnvelope, SyncResponse } from "@smritisetu/shared-types";
import type { SqliteDatabase } from "../../db/adapter";
import { openNodeDatabase } from "../../db/nodeAdapter";
import { runMigrations } from "../../db/migrations";
import {
  DeviceRepository,
  GameSessionRepository,
  ReminderRepository,
  SyncQueueRepository,
} from "../../db/repositories";
import { ApiRequestError, NetworkError } from "../../api/errors";
import { runSync, type SyncDependencies } from "../syncEngine";
import { backoffDelayMs, isReadyToRetry, MAX_DELAY_MS } from "../backoff";

let db: SqliteDatabase;
const PATIENT = "11111111-1111-4111-8111-111111111111";
const DEVICE = "22222222-2222-4222-8222-222222222222";

before(async () => {
  db = await openNodeDatabase(":memory:");
  await runMigrations(db);
});

after(async () => {
  await db.closeAsync();
});

beforeEach(async () => {
  for (const table of ["sync_queue", "game_sessions", "reminder_events", "device_config"]) {
    await db.runAsync(`DELETE FROM ${table}`);
  }
  await new DeviceRepository(db).save({
    deviceIdentifier: "test-device",
    deviceId: DEVICE,
    patientId: PATIENT,
    packageVersion: 1,
  });
});

function emptyResponse(overrides: Partial<SyncResponse> = {}): SyncResponse {
  return {
    accepted: [],
    duplicates: [],
    rejected: [],
    conflicts: [],
    serverTime: new Date().toISOString(),
    ...overrides,
  };
}

function deps(
  push: (events: SyncEventEnvelope[], version: number) => Promise<SyncResponse>,
  now?: () => number,
): SyncDependencies {
  return {
    queue: new SyncQueueRepository(db),
    devices: new DeviceRepository(db),
    games: new GameSessionRepository(db),
    reminders: new ReminderRepository(db),
    push,
    now,
  };
}

async function enqueueGame(eventId: string, createdAt = new Date().toISOString()) {
  await new GameSessionRepository(db).insert({
    eventId,
    patientId: PATIENT,
    deviceId: DEVICE,
    gameType: "MEMORY_MATCH",
    difficulty: 2,
    accuracy: 0.8,
    responseTimeSeconds: 9,
    hintsUsed: 1,
    attempts: 8,
    completed: true,
    abandoned: false,
    engagementDurationSeconds: 180,
    playedAt: createdAt,
    syncStatus: "PENDING",
  });
  await new SyncQueueRepository(db).enqueue({
    eventId,
    eventType: "GAME_SESSION",
    payload: JSON.stringify({ gameType: "MEMORY_MATCH", playedAt: createdAt }),
    patientId: PATIENT,
    deviceId: DEVICE,
    localCreatedAt: createdAt,
  });
}

describe("backoff", () => {
  it("grows exponentially and stops at the cap", () => {
    const noJitter = () => 1;
    const delays = [0, 1, 2, 3, 4, 5, 6, 7, 8, 20].map((n) => backoffDelayMs(n, noJitter));
    for (let i = 1; i < 8; i++) {
      assert.ok(delays[i] > delays[i - 1], `delay ${i} should exceed delay ${i - 1}`);
    }
    assert.ok(delays.at(-1)! <= MAX_DELAY_MS);
  });

  it("never exceeds the cap even with jitter", () => {
    for (const jitter of [0, 0.5, 0.99]) {
      assert.ok(backoffDelayMs(50, () => jitter) <= MAX_DELAY_MS);
    }
  });

  it("allows an immediate first attempt", () => {
    assert.equal(isReadyToRetry(0, undefined), true);
  });

  it("holds off until the delay has elapsed", () => {
    const lastAttempt = new Date("2026-08-25T12:00:00.000Z").toISOString();
    const justAfter = new Date("2026-08-25T12:00:01.000Z").getTime();
    const muchLater = new Date("2026-08-25T13:00:00.000Z").getTime();
    assert.equal(isReadyToRetry(3, lastAttempt, justAfter), false);
    assert.equal(isReadyToRetry(3, lastAttempt, muchLater), true);
  });
});

describe("successful synchronisation", () => {
  it("sends queued events and clears them once accepted", async () => {
    await enqueueGame("e1");
    await enqueueGame("e2");

    let sent: SyncEventEnvelope[] = [];
    const outcome = await runSync(
      deps(async (events) => {
        sent = events;
        return emptyResponse({ accepted: events.map((e) => e.eventId) });
      }),
    );

    assert.equal(outcome.accepted, 2);
    assert.equal(outcome.remaining, 0);
    assert.equal(sent.length, 2);
    assert.equal(await new SyncQueueRepository(db).countPending(), 0);
  });

  it("marks the local game rows as synced", async () => {
    await enqueueGame("e1");
    await runSync(deps(async (events) => emptyResponse({ accepted: events.map((e) => e.eventId) })));
    const session = await new GameSessionRepository(db).findById("e1");
    assert.equal(session?.syncStatus, "SYNCED");
  });

  it("sends events in creation order", async () => {
    const now = Date.now();
    await enqueueGame("newer", new Date(now).toISOString());
    await enqueueGame("older", new Date(now - 60_000).toISOString());

    let order: string[] = [];
    await runSync(
      deps(async (events) => {
        order = events.map((e) => e.eventId);
        return emptyResponse({ accepted: order });
      }),
    );
    assert.deepEqual(order, ["older", "newer"]);
  });

  it("builds a complete envelope for every event", async () => {
    await enqueueGame("e1");
    let envelope: SyncEventEnvelope | undefined;
    await runSync(
      deps(async (events) => {
        envelope = events[0];
        return emptyResponse({ accepted: [events[0].eventId] });
      }),
    );

    assert.equal(envelope?.eventId, "e1");
    assert.equal(envelope?.patientId, PATIENT);
    assert.equal(envelope?.deviceId, DEVICE);
    assert.equal(envelope?.eventType, "GAME_SESSION");
    assert.equal(envelope?.payloadVersion, 1);
    assert.ok(envelope?.eventTimestamp);
    assert.ok(envelope?.localCreatedAt);
  });

  it("records the server time as the last successful sync", async () => {
    await enqueueGame("e1");
    const serverTime = "2026-08-25T09:30:00.000Z";
    await runSync(deps(async (events) => emptyResponse({ accepted: events.map((e) => e.eventId), serverTime })));
    const device = await new DeviceRepository(db).get();
    assert.equal(device?.lastSyncAt, serverTime);
    assert.equal(device?.lastSyncError, null);
  });

  it("does nothing when the queue is empty", async () => {
    let called = false;
    const outcome = await runSync(
      deps(async () => {
        called = true;
        return emptyResponse();
      }),
    );
    assert.equal(outcome.ran, false);
    assert.equal(called, false);
  });
});

describe("duplicate prevention", () => {
  it("treats a server-reported duplicate as confirmed and clears it", async () => {
    await enqueueGame("e1");
    const outcome = await runSync(
      deps(async (events) => emptyResponse({ duplicates: events.map((e) => e.eventId) })),
    );
    assert.equal(outcome.duplicates, 1);
    assert.equal(await new SyncQueueRepository(db).countPending(), 0);
  });

  it("cannot queue the same event twice", async () => {
    await enqueueGame("e1");
    await enqueueGame("e1");
    assert.equal(await new SyncQueueRepository(db).countPending(), 1);
  });

  it("does not resend an event after it has been confirmed", async () => {
    await enqueueGame("e1");
    await runSync(deps(async (events) => emptyResponse({ accepted: events.map((e) => e.eventId) })));

    let secondCallEvents: SyncEventEnvelope[] | null = null;
    await runSync(
      deps(async (events) => {
        secondCallEvents = events;
        return emptyResponse();
      }),
    );
    assert.equal(secondCallEvents, null, "nothing should be sent on the second run");
  });
});

describe("partial success", () => {
  it("clears accepted events and parks rejected ones", async () => {
    await enqueueGame("good");
    await enqueueGame("bad");

    const outcome = await runSync(
      deps(async () =>
        emptyResponse({
          accepted: ["good"],
          rejected: [{ eventId: "bad", code: "INVALID_GAME_SESSION", message: "difficulty out of range" }],
        }),
      ),
    );

    assert.equal(outcome.accepted, 1);
    assert.equal(outcome.rejected, 1);
    assert.equal(await new SyncQueueRepository(db).has("good"), false);
    assert.equal(await new SyncQueueRepository(db).has("bad"), true, "a rejected event is kept for support");
  });

  it("parks a conflicting event instead of resolving it on the device", async () => {
    await enqueueGame("conflicted");
    const outcome = await runSync(
      deps(async () =>
        emptyResponse({
          conflicts: [
            { eventId: "conflicted", serverVersion: 2, clientVersion: 1, resolutionRequired: true },
          ],
        }),
      ),
    );

    assert.equal(outcome.conflicts, 1);
    const counts = await new SyncQueueRepository(db).countByStatus();
    assert.equal(counts.CONFLICT, 1);
  });

  it("retries an event the server did not mention", async () => {
    await enqueueGame("mentioned");
    await enqueueGame("ignored");
    await runSync(deps(async () => emptyResponse({ accepted: ["mentioned"] })));

    const remaining = await new SyncQueueRepository(db).nextBatch();
    assert.deepEqual(remaining.map((i) => i.eventId), ["ignored"]);
    assert.equal(remaining[0].retryCount, 1);
  });
});

describe("failure handling", () => {
  it("keeps every event when the device is offline", async () => {
    await enqueueGame("e1");
    const outcome = await runSync(
      deps(async () => {
        throw new NetworkError("offline");
      }),
    );

    assert.equal(outcome.error, "OFFLINE");
    assert.equal(outcome.accepted, 0);
    assert.equal(await new SyncQueueRepository(db).countPending(), 1, "data is retained until confirmed");
  });

  it("counts a retry so the backoff grows", async () => {
    await enqueueGame("e1");
    const failing = deps(async () => {
      throw new NetworkError("offline");
    });
    await runSync(failing);
    await runSync({ ...failing, now: () => Date.now() + 60 * 60 * 1000 });
    assert.equal(await new SyncQueueRepository(db).maxRetryCount(), 2);
  });

  it("honours the backoff and skips an attempt that is too soon", async () => {
    await enqueueGame("e1");
    await runSync(
      deps(async () => {
        throw new NetworkError("offline");
      }),
    );

    let attempted = false;
    const outcome = await runSync(
      // Immediately after the failure, so the backoff has not elapsed.
      deps(async () => {
        attempted = true;
        return emptyResponse();
      }, () => Date.now()),
    );
    assert.equal(attempted, false);
    assert.equal(outcome.ran, false);
  });

  it("retries once the backoff has elapsed", async () => {
    await enqueueGame("e1");
    await runSync(
      deps(async () => {
        throw new NetworkError("offline");
      }),
    );

    let attempted = false;
    await runSync(
      deps(async (events) => {
        attempted = true;
        return emptyResponse({ accepted: events.map((e) => e.eventId) });
      }, () => Date.now() + 60 * 60 * 1000),
    );
    assert.equal(attempted, true);
    assert.equal(await new SyncQueueRepository(db).countPending(), 0);
  });

  it("retries after a server error", async () => {
    await enqueueGame("e1");
    const outcome = await runSync(
      deps(async () => {
        throw new ApiRequestError(503, "SERVICE_UNAVAILABLE", "down for maintenance");
      }),
    );
    assert.equal(outcome.accepted, 0);
    assert.equal(await new SyncQueueRepository(db).countPending(), 1);
  });

  it("keeps data and flags re-pairing when the session expires", async () => {
    await enqueueGame("e1");
    const outcome = await runSync(
      deps(async () => {
        throw new ApiRequestError(401, "TOKEN_EXPIRED", "session expired");
      }),
    );

    assert.equal(outcome.needsRepair, true);
    assert.equal(outcome.error, "SESSION_EXPIRED");
    assert.equal(await new SyncQueueRepository(db).countPending(), 1, "nothing is discarded");
  });

  it("parks a batch the server will never accept", async () => {
    await enqueueGame("e1");
    await runSync(
      deps(async () => {
        throw new ApiRequestError(422, "VALIDATION_ERROR", "malformed batch");
      }),
    );
    const [item] = await new SyncQueueRepository(db).nextBatch();
    assert.equal(item.retryCount, 99);
  });

  it("records the failure so the sync-status screen can explain it", async () => {
    await enqueueGame("e1");
    await runSync(
      deps(async () => {
        throw new NetworkError("offline");
      }),
    );
    const device = await new DeviceRepository(db).get();
    assert.ok(device?.lastSyncError);
  });
});

describe("restart recovery", () => {
  it("re-sends events left in flight by a crash", async () => {
    await enqueueGame("e1");
    // Simulate a crash after marking SYNCING but before the response arrived.
    await new SyncQueueRepository(db).markSyncing(["e1"]);

    let sent: string[] = [];
    const outcome = await runSync(
      deps(async (events) => {
        sent = events.map((e) => e.eventId);
        return emptyResponse({ duplicates: sent });
      }),
    );

    assert.deepEqual(sent, ["e1"], "an interrupted event must be retried after restart");
    assert.equal(outcome.duplicates, 1, "the server recognises it, so nothing is stored twice");
    assert.equal(await new SyncQueueRepository(db).countPending(), 0);
  });

  it("keeps queued work across a simulated restart", async () => {
    await enqueueGame("e1");
    await runSync(
      deps(async () => {
        throw new NetworkError("offline");
      }),
    );

    // A "restart" is just new repository instances over the same database.
    const afterRestart = await new SyncQueueRepository(db).nextBatch();
    assert.equal(afterRestart.length, 1);
    assert.equal(afterRestart[0].eventId, "e1");
  });
});

describe("package version", () => {
  it("reports a newer package version so the app can refresh its content", async () => {
    await enqueueGame("e1");
    const outcome = await runSync(
      deps(async (events) =>
        emptyResponse({ accepted: events.map((e) => e.eventId), nextPackageVersion: 5 }),
      ),
    );
    assert.equal(outcome.nextPackageVersion, 5);
  });

  it("sends the version the device currently holds", async () => {
    await enqueueGame("e1");
    let sentVersion = -1;
    await runSync(
      deps(async (events, version) => {
        sentVersion = version;
        return emptyResponse({ accepted: events.map((e) => e.eventId) });
      }),
    );
    assert.equal(sentVersion, 1);
  });
});
