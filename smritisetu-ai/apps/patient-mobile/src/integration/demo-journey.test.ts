/**
 * End-to-end demo journey, mobile side.
 *
 * Runs the real application code — API client, pairing service, repositories,
 * reminder manager and sync engine — against a live backend and ML service, in
 * plain Node with the native modules stubbed. This is the mobile half of the
 * required demo journey; the backend half lives in
 * services/backend-api/src/tests/demo-journey.test.ts.
 *
 * Skipped automatically when the backend is not running, so `npm test` stays
 * green offline:
 *
 *   npm run db:seed -w @smritisetu/backend-api
 *   npm run dev -w @smritisetu/backend-api        # http://localhost:4000
 *   cd services/ml-service && .venv/bin/uvicorn app.main:app --port 8000
 *   npm run test:integration -w @smritisetu/patient-mobile
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { setDatabaseOpener, initialiseDatabase, getDatabase } from "../db";
import { openNodeDatabase } from "../db/nodeAdapter";
import {
  ContactRepository,
  DeviceRepository,
  DifficultyRepository,
  GameSessionRepository,
  LanguagePackRepository,
  MemoryRepository,
  PatientRepository,
  ReminderRepository,
  ScheduleRepository,
  SyncQueueRepository,
} from "../db/repositories";
import { pairAndDownload } from "../session/pairingService";
import { eventQueue } from "../sync/eventQueue";
import { syncNow } from "../sync/syncNow";
import { runSync } from "../sync/syncEngine";
import { apiClient } from "../api/client";
import { secureStorage } from "../api/secureStorage";
import { newEventId } from "../utils/id";
import { planRemindersForDay } from "../notifications/reminderScheduler";
import { derivedState } from "../notifications/reminderState";
import * as matchGame from "../games/logic/memoryMatch";
import * as whoGame from "../games/logic/whoIsThis";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

let patientId = "";
let deviceId = "";

/**
 * Probed at module scope, because `describe`'s skip flag is read as the suite
 * is declared — before any `before` hook could set it.
 */
const backendUp = await (async () => {
  try {
    const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
})();

if (!backendUp) {
  console.log(`\n  Skipping integration test: no backend at ${API_URL}\n`);
}

before(async () => {
  if (!backendUp) return;
  setDatabaseOpener(() => openNodeDatabase(":memory:"));
  const init = await initialiseDatabase();
  assert.equal(init.ready, true, "the local database must initialise");
});

after(async () => {
  if (backendUp) await getDatabase().closeAsync().catch(() => undefined);
});

describe("demo journey (mobile against a live backend)", { skip: !backendUp }, () => {
  it("step 3: pairs the device with the six-digit code 123456", async () => {
    const steps: string[] = [];
    const result = await pairAndDownload("123456", (progress) => steps.push(progress.step));

    assert.equal(result.ok, true, "pairing with 123456 must succeed");
    if (!result.ok) return;

    patientId = result.patientId;
    deviceId = result.deviceId;

    assert.ok(steps.includes("CONNECTING"));
    assert.ok(steps.includes("DOWNLOADING"));
    assert.ok(steps.includes("COMPLETE"));

    // The credential is in secure storage, never in SQLite.
    assert.ok(await secureStorage.getDeviceToken());
    const rows = await getDatabase().getAllAsync<{ value: string }>(
      "SELECT value FROM app_settings",
    );
    assert.ok(rows.every((r) => !r.value.startsWith("eyJ")), "no token may be written to SQLite");
  });

  it("step 4: stores Aita's Assamese offline package on the device", async () => {
    const patient = await new PatientRepository().get();
    assert.equal(patient?.preferredName, "Aita");
    assert.equal(patient?.preferredLanguage, "as");

    const pack = await new LanguagePackRepository().get("as");
    assert.ok(pack, "the Assamese language pack must be cached");
    assert.ok(
      Object.keys(pack!.translations).length > 100,
      "the pack must carry the full translation set",
    );
    assert.ok(pack!.translations["home.playGames"]);

    const schedules = await new ScheduleRepository().listActive(patientId);
    assert.ok(schedules.length > 0, "schedules must be cached for offline reminders");

    const contacts = await new ContactRepository().list(patientId);
    assert.ok(contacts.length >= 4, "family contacts must be cached");

    const memories = await new MemoryRepository().listByCategory(patientId);
    assert.ok(memories.length > 0, "consented memories must be cached");

    const people = await new MemoryRepository().listPeople(patientId);
    assert.ok(people.length >= 2, "Who Is This? needs at least two named people");
  });

  it("step 5-8: plays two activities with no network and queues them locally", async () => {
    const difficulty = await new DifficultyRepository().get(patientId, "MEMORY_MATCH");
    assert.ok(difficulty, "a difficulty profile must have arrived in the package");

    // --- Memory Match, played through the real game logic -----------------
    let board = matchGame.endPreview(
      matchGame.createGame(difficulty!.currentDifficulty, 3),
    );
    for (const objectId of new Set(board.cards.map((c) => c.objectId))) {
      const [a, b] = board.cards.filter((c) => c.objectId === objectId);
      board = matchGame.flipCard(board, a.cardId).state;
      board = matchGame.flipCard(board, b.cardId).state;
    }
    assert.equal(board.completed, true);

    await eventQueue.recordGameSession(
      {
        patientId,
        deviceId,
        gameType: "MEMORY_MATCH",
        difficulty: difficulty!.currentDifficulty,
        accuracy: matchGame.computeAccuracy(board),
        responseTimeSeconds: 8.4,
        hintsUsed: board.hintsUsed,
        attempts: board.attempts,
        completed: true,
        abandoned: false,
        engagementDurationSeconds: 190,
        playedAt: new Date().toISOString(),
      },
      { matchedPairs: board.matchedPairs, totalPairs: board.totalPairs },
    );

    // --- Who Is This? -----------------------------------------------------
    const people = await new MemoryRepository().listPeople(patientId);
    let quiz = whoGame.createGame(people, 2, 2)!;
    assert.ok(quiz, "a session must be possible from the cached photographs");
    const correct = quiz.rounds[0].choices.find((c) => c.isCorrect)!;
    quiz = whoGame.answer(quiz, correct.id).state;

    await eventQueue.recordGameSession({
      patientId,
      deviceId,
      gameType: "WHO_IS_THIS",
      difficulty: 2,
      accuracy: whoGame.computeAccuracy(quiz),
      responseTimeSeconds: 6.1,
      hintsUsed: quiz.hintsUsed,
      attempts: quiz.totalAttempts,
      completed: true,
      abandoned: false,
      engagementDurationSeconds: 95,
      playedAt: new Date().toISOString(),
    });

    // Both are in SQLite and both are queued.
    const stored = await new GameSessionRepository().listRecent(patientId);
    assert.equal(stored.length, 2);
    assert.ok(stored.every((s) => s.syncStatus === "PENDING"));
    assert.equal(await new SyncQueueRepository().countPending(), 2);
  });

  it("step 9-11: records a critical medicine reminder missed twice", async () => {
    const schedules = await new ScheduleRepository().listActive(patientId);
    const medicine = schedules.find((s) => s.kind === "MEDICINE" && s.critical);
    assert.ok(medicine, "the demo patient must have a critical medicine schedule");

    // The reminder was due and its window elapsed while the phone was offline.
    for (const daysAgo of [1, 0]) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() - daysAgo);
      dueAt.setHours(dueAt.getHours() - 3, 0, 0, 0);

      const state = derivedState("UPCOMING", dueAt, medicine!.missedAfterMinutes);
      assert.equal(state, "MISSED", "an elapsed, untouched reminder becomes MISSED");

      await eventQueue.recordReminderState({
        eventId: newEventId(),
        patientId,
        deviceId,
        scheduleId: medicine!.scheduleId,
        scheduleVersion: medicine!.version,
        kind: medicine!.kind,
        critical: true,
        dueAt: dueAt.toISOString(),
        state,
        stateChangedAt: new Date().toISOString(),
        snoozeCount: 1,
        helpRequested: false,
      });
    }

    assert.equal(await new SyncQueueRepository().countPending(), 4);

    // Reminders are planned locally from the cached schedules, with no network.
    const planned = planRemindersForDay(schedules);
    assert.ok(planned.length > 0, "the day's reminders must be computable offline");
  });

  it("step 12-13: synchronises every pending event once connectivity returns", async () => {
    const outcome = await syncNow();

    assert.equal(outcome.ran, true);
    assert.equal(outcome.accepted, 4, "all four queued events must be accepted");
    assert.equal(outcome.rejected, 0);
    assert.equal(outcome.conflicts, 0);
    assert.equal(outcome.remaining, 0, "the queue must be empty after a successful sync");

    const sessions = await new GameSessionRepository().listRecent(patientId);
    assert.ok(sessions.every((s) => s.syncStatus === "SYNCED"));

    const device = await new DeviceRepository().get();
    assert.ok(device?.lastSyncAt, "the last successful sync time must be recorded");
    assert.equal(device?.lastSyncError, null);
  });

  it("step 14: the backend prevents duplicates when the batch is replayed", async () => {
    // Re-queue the same events, exactly as an interrupted sync would.
    const sessions = await new GameSessionRepository().listRecent(patientId);
    const queue = new SyncQueueRepository();

    for (const session of sessions) {
      await queue.enqueue({
        eventId: session.eventId,
        eventType: "GAME_SESSION",
        payload: JSON.stringify({
          gameType: session.gameType,
          difficulty: session.difficulty,
          accuracy: session.accuracy,
          responseTimeSeconds: session.responseTimeSeconds,
          hintsUsed: session.hintsUsed,
          attempts: session.attempts,
          completed: session.completed,
          abandoned: session.abandoned,
          engagementDurationSeconds: session.engagementDurationSeconds,
          playedAt: session.playedAt,
        }),
        patientId,
        deviceId,
        localCreatedAt: new Date().toISOString(),
      });
    }

    const outcome = await syncNow();
    assert.equal(outcome.accepted, 0, "nothing new should be accepted");
    assert.equal(outcome.duplicates, sessions.length, "a replay is reported as duplicates");
    assert.equal(outcome.remaining, 0, "confirmed duplicates are cleared from the queue");
  });

  it("step 15-16: the backend stores a difficulty recommendation from the ML service", async () => {
    const config = await apiClient.getGameConfig(patientId);
    const memoryMatch = config.games.find((g) => g.gameType === "MEMORY_MATCH");

    assert.ok(memoryMatch, "the game configuration must include Memory Match");
    assert.ok(memoryMatch!.difficulty >= 1 && memoryMatch!.difficulty <= 4);
    assert.ok(memoryMatch!.previewSeconds && memoryMatch!.previewSeconds > 0);
    assert.ok(config.recommendationExplanation.length > 0, "the recommendation must be explained");

    // Memory Lane is present and always unscored.
    const lane = config.games.find((g) => g.gameType === "MEMORY_LANE");
    assert.ok(lane?.enabled);
  });

  it("step 18: the app can report a successful synchronisation", async () => {
    const status = await apiClient.getSyncStatus(deviceId);

    assert.equal(status.patientId, patientId);
    assert.ok(status.lastSyncAt, "the server must report a last sync time");
    assert.ok(status.acceptedEventCount >= 4);
    assert.equal(await new SyncQueueRepository().countPending(), 0);
  });

  it("keeps working when the network disappears mid-journey", async () => {
    // A queued event with the server unreachable: nothing is lost.
    await eventQueue.recordHelpRequest({ patientId, deviceId, context: "integration_test" });
    assert.equal(await new SyncQueueRepository().countPending(), 1);

    const originalUrl = process.env.EXPO_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = "http://127.0.0.1:9";

    // The client reads its base URL at import time, so the offline case is
    // simulated by a fetch failure instead.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;

    const offlineOutcome = await syncNow();
    globalThis.fetch = originalFetch;
    if (originalUrl) process.env.EXPO_PUBLIC_API_URL = originalUrl;

    assert.equal(offlineOutcome.error, "OFFLINE");
    assert.equal(
      await new SyncQueueRepository().countPending(),
      1,
      "the help request is retained, not discarded",
    );

    // An immediate retry is deliberately held back by the exponential backoff,
    // so a weak connection is not hammered.
    const tooSoon = await syncNow();
    assert.equal(tooSoon.ran, false, "the backoff defers an immediate retry");
    assert.equal(await new SyncQueueRepository().countPending(), 1);

    // Once the backoff has elapsed the retained event is delivered. The clock
    // is advanced rather than waited on.
    const delivered = await runSync({
      queue: new SyncQueueRepository(),
      devices: new DeviceRepository(),
      games: new GameSessionRepository(),
      reminders: new ReminderRepository(),
      push: (events, version) => apiClient.pushEvents(events, version),
      now: () => Date.now() + 60 * 60 * 1000,
    });

    assert.ok(
      delivered.accepted + delivered.duplicates >= 1,
      "the retained event is delivered once the backoff has elapsed",
    );
    assert.equal(await new SyncQueueRepository().countPending(), 0);
  });

  it("stores a reminder acknowledgement as an acknowledgement, never as consumption", async () => {
    const schedules = await new ScheduleRepository().listActive(patientId);
    const medicine = schedules.find((s) => s.kind === "MEDICINE")!;
    const dueAt = new Date();
    dueAt.setHours(dueAt.getHours() - 1, 0, 0, 0);
    const eventId = newEventId();

    await eventQueue.recordReminderState({
      eventId,
      patientId,
      deviceId,
      scheduleId: medicine.scheduleId,
      scheduleVersion: medicine.version,
      kind: medicine.kind,
      critical: medicine.critical,
      dueAt: dueAt.toISOString(),
      state: "ACKNOWLEDGED",
      stateChangedAt: new Date().toISOString(),
      snoozeCount: 0,
      helpRequested: false,
    });

    const stored = await new ReminderRepository().findById(eventId);
    assert.equal(stored?.state, "ACKNOWLEDGED");
    // The schema records the reminder's state, and nothing more: there is no
    // field anywhere that claims the medicine was taken.
    const columns = await getDatabase().getAllAsync<{ name: string }>(
      "SELECT name FROM pragma_table_info('reminder_events')",
    );
    const names = columns.map((c) => c.name);
    for (const forbidden of ["taken", "consumed", "ingested", "swallowed"]) {
      assert.ok(!names.includes(forbidden), `reminder_events must not have a "${forbidden}" column`);
    }
  });
});
