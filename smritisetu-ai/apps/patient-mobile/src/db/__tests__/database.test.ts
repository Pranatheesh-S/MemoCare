import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import type { SqliteDatabase } from "../adapter";
import { openNodeDatabase } from "../nodeAdapter";
import { LATEST_SCHEMA_VERSION, MIGRATIONS, runMigrations } from "../migrations";
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
  SettingsRepository,
  SyncQueueRepository,
} from "../repositories";

let db: SqliteDatabase;
const PATIENT = "11111111-1111-4111-8111-111111111111";
const DEVICE = "22222222-2222-4222-8222-222222222222";

before(async () => {
  db = await openNodeDatabase(":memory:");
});

after(async () => {
  await db.closeAsync();
});

beforeEach(async () => {
  const tables = [
    "patient_profile", "device_config", "schedules", "reminder_events", "game_sessions",
    "memory_assets", "family_contacts", "difficulty_profiles", "sync_queue",
    "language_packages", "app_settings",
  ];
  await runMigrations(db);
  for (const table of tables) {
    await db.runAsync(`DELETE FROM ${table}`).catch(() => undefined);
  }
});

describe("initialisation and migrations", () => {
  it("creates every required table", async () => {
    await runMigrations(db);
    const rows = await db.getAllAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    const names = new Set(rows.map((r) => r.name));
    for (const required of [
      "patient_profile", "device_config", "schedules", "reminder_events", "game_sessions",
      "memory_assets", "difficulty_profiles", "sync_queue", "language_packages", "app_settings",
    ]) {
      assert.ok(names.has(required), `missing table ${required}`);
    }
  });

  it("reports the latest schema version", async () => {
    const version = await runMigrations(db);
    assert.equal(version, LATEST_SCHEMA_VERSION);
  });

  it("is safe to run repeatedly", async () => {
    await runMigrations(db);
    await runMigrations(db);
    const applied = await db.getAllAsync<{ version: number }>("SELECT version FROM schema_migrations");
    assert.equal(applied.length, MIGRATIONS.length);
  });

  it("recovers when a migration is interrupted", async () => {
    // Simulate a crash after the tables existed but before the version row
    // landed: the next launch must complete rather than get stuck.
    await db.runAsync("DELETE FROM schema_migrations");
    const version = await runMigrations(db);
    assert.equal(version, LATEST_SCHEMA_VERSION);
  });
});

describe("PatientRepository", () => {
  const repo = () => new PatientRepository(db);
  const profile = {
    patientId: PATIENT,
    displayName: "Aita",
    preferredName: "Aita",
    age: 72,
    location: "Jorhat, Assam",
    preferredLanguage: "as" as const,
    reducedMotion: false,
    largeText: true,
    audioGuidanceEnabled: true,
  };

  it("stores and reads a profile", async () => {
    await repo().upsert(profile);
    const stored = await repo().get();
    assert.equal(stored?.preferredName, "Aita");
    assert.equal(stored?.preferredLanguage, "as");
    assert.equal(stored?.largeText, true);
    assert.equal(stored?.reducedMotion, false);
  });

  it("updates rather than duplicating on a second upsert", async () => {
    await repo().upsert(profile);
    await repo().upsert({ ...profile, preferredName: "Aai" });
    const rows = await db.getAllAsync("SELECT * FROM patient_profile");
    assert.equal(rows.length, 1);
    const stored = await repo().get();
    assert.equal(stored?.preferredName, "Aai");
  });

  it("updates only the preferences that were passed", async () => {
    await repo().upsert(profile);
    await repo().updatePreferences({ reducedMotion: true });
    const stored = await repo().get();
    assert.equal(stored?.reducedMotion, true);
    assert.equal(stored?.preferredLanguage, "as", "language must be untouched");
    assert.equal(stored?.largeText, true);
  });

  it("returns null before pairing", async () => {
    assert.equal(await repo().get(), null);
  });
});

describe("SyncQueueRepository", () => {
  const repo = () => new SyncQueueRepository(db);
  const item = (eventId: string, createdAt = new Date().toISOString()) => ({
    eventId,
    eventType: "GAME_SESSION",
    payload: JSON.stringify({ gameType: "MEMORY_MATCH" }),
    patientId: PATIENT,
    deviceId: DEVICE,
    localCreatedAt: createdAt,
  });

  it("enqueues an event", async () => {
    const inserted = await repo().enqueue(item("a"));
    assert.equal(inserted, true);
    assert.equal(await repo().countPending(), 1);
  });

  it("prevents duplicates structurally", async () => {
    assert.equal(await repo().enqueue(item("a")), true);
    assert.equal(await repo().enqueue(item("a")), false, "a repeat enqueue must be ignored");
    assert.equal(await repo().countPending(), 1);
  });

  it("returns pending work in creation order, not insertion order", async () => {
    const now = Date.now();
    await repo().enqueue(item("newer", new Date(now).toISOString()));
    await repo().enqueue(item("older", new Date(now - 60_000).toISOString()));
    const batch = await repo().nextBatch();
    assert.deepEqual(batch.map((i) => i.eventId), ["older", "newer"]);
  });

  it("removes an item once the server confirms it", async () => {
    await repo().enqueue(item("a"));
    await repo().markSynced(["a"]);
    assert.equal(await repo().countPending(), 0);
    assert.equal(await repo().has("a"), false);
  });

  it("keeps a failed item queued and counts the retry", async () => {
    await repo().enqueue(item("a"));
    await repo().markFailed(["a"], "network down");
    const [queued] = await repo().nextBatch();
    assert.equal(queued.eventId, "a");
    assert.equal(queued.retryCount, 1);
    assert.equal(queued.status, "FAILED");
    // Still pending work — data is retained until the server confirms it.
    assert.equal(await repo().countPending(), 1);
  });

  it("increments the retry count on each failure", async () => {
    await repo().enqueue(item("a"));
    await repo().markFailed(["a"], "1");
    await repo().markFailed(["a"], "2");
    await repo().markFailed(["a"], "3");
    assert.equal(await repo().maxRetryCount(), 3);
  });

  it("parks a permanently rejected item instead of looping forever", async () => {
    await repo().enqueue(item("a"));
    await repo().markRejected(["a"], "INVALID_GAME_SESSION");
    const [queued] = await repo().nextBatch();
    assert.equal(queued.retryCount, 99);
    assert.match(queued.lastError ?? "", /INVALID_GAME_SESSION/);
  });

  it("marks a conflicting item so it is not retried blindly", async () => {
    await repo().enqueue(item("a"));
    await repo().markConflict(["a"]);
    const counts = await repo().countByStatus();
    assert.equal(counts.CONFLICT, 1);
    // A conflicting item is not returned as ordinary pending work.
    assert.equal((await repo().nextBatch()).length, 0);
  });

  it("recovers items left in flight by a crash", async () => {
    await repo().enqueue(item("a"));
    await repo().enqueue(item("b"));
    await repo().markSyncing(["a", "b"]);
    assert.equal((await repo().nextBatch()).length, 0, "in-flight items are not re-sent while syncing");

    const recovered = await repo().recoverInFlight();
    assert.equal(recovered, 2);
    assert.equal((await repo().nextBatch()).length, 2, "after restart they are pending again");
  });

  it("respects the batch limit", async () => {
    for (let i = 0; i < 10; i++) {
      await repo().enqueue(item(`e${i}`, new Date(Date.now() + i).toISOString()));
    }
    assert.equal((await repo().nextBatch(4)).length, 4);
  });
});

describe("GameSessionRepository", () => {
  const repo = () => new GameSessionRepository(db);
  const session = (eventId: string, overrides: Record<string, unknown> = {}) => ({
    eventId,
    patientId: PATIENT,
    deviceId: DEVICE,
    gameType: "MEMORY_MATCH" as const,
    difficulty: 2,
    accuracy: 0.8,
    responseTimeSeconds: 9,
    hintsUsed: 1,
    attempts: 8,
    completed: true,
    abandoned: false,
    engagementDurationSeconds: 180,
    playedAt: new Date().toISOString(),
    syncStatus: "PENDING" as const,
    ...overrides,
  });

  it("stores a session with its game-specific detail", async () => {
    await repo().insert(session("s1"), { matchedPairs: 3, totalPairs: 3 });
    const stored = await repo().findById("s1");
    assert.equal(stored?.gameType, "MEMORY_MATCH");
    assert.equal(stored?.accuracy, 0.8);
    assert.deepEqual(stored?.detail, { matchedPairs: 3, totalPairs: 3 });
  });

  it("ignores a repeated insert of the same session", async () => {
    await repo().insert(session("s1"));
    await repo().insert(session("s1", { accuracy: 0.1 }));
    const all = await repo().listRecent(PATIENT);
    assert.equal(all.length, 1);
    assert.equal(all[0].accuracy, 0.8, "the first write wins; a replay changes nothing");
  });

  it("keeps accuracy null for an unscored Memory Lane session", async () => {
    await repo().insert(session("s2", { gameType: "MEMORY_LANE", accuracy: null, difficulty: 1 }));
    const stored = await repo().findById("s2");
    assert.equal(stored?.accuracy, null);
  });

  it("lists newest first and filters by game type", async () => {
    await repo().insert(session("old", { playedAt: new Date(Date.now() - 86400000).toISOString() }));
    await repo().insert(session("new", { playedAt: new Date().toISOString() }));
    await repo().insert(session("other", {
      gameType: "WHO_IS_THIS",
      playedAt: new Date(Date.now() - 3600000).toISOString(),
    }));

    const all = await repo().listRecent(PATIENT);
    assert.equal(all[0].eventId, "new");

    const filtered = await repo().listRecent(PATIENT, 10, "WHO_IS_THIS");
    assert.deepEqual(filtered.map((s) => s.eventId), ["other"]);
  });

  it("tracks how many sessions are still unsynced", async () => {
    await repo().insert(session("s1"));
    await repo().insert(session("s2"));
    assert.equal(await repo().countPending(PATIENT), 2);
    await repo().markSynced(["s1"]);
    assert.equal(await repo().countPending(PATIENT), 1);
  });
});

describe("ReminderRepository", () => {
  const repo = () => new ReminderRepository(db);
  const dueAt = "2026-08-25T14:30:00.000Z";
  const event = (eventId: string, state: string, overrides: Record<string, unknown> = {}) => ({
    eventId,
    patientId: PATIENT,
    deviceId: DEVICE,
    scheduleId: "sched-1",
    scheduleVersion: 1,
    kind: "MEDICINE" as const,
    critical: true,
    dueAt,
    state: state as never,
    stateChangedAt: new Date().toISOString(),
    snoozeCount: 0,
    helpRequested: false,
    syncStatus: "PENDING" as const,
    ...overrides,
  });

  it("stores a reminder and finds it by occurrence", async () => {
    await repo().upsert(event("r1", "DUE"));
    const found = await repo().findOccurrence("sched-1", dueAt);
    assert.equal(found?.state, "DUE");
    assert.equal(found?.critical, true);
  });

  it("records a state transition on the same occurrence row", async () => {
    await repo().upsert(event("r1", "DUE"));
    await repo().upsert(event("r1", "ACKNOWLEDGED"));
    const found = await repo().findOccurrence("sched-1", dueAt);
    assert.equal(found?.state, "ACKNOWLEDGED");
  });

  it("counts missed occurrences for a schedule", async () => {
    await repo().upsert(event("r1", "MISSED", { dueAt: "2026-08-23T14:30:00.000Z" }));
    await repo().upsert(event("r2", "MISSED", { dueAt: "2026-08-24T14:30:00.000Z" }));
    await repo().upsert(event("r3", "ACKNOWLEDGED"));
    const missed = await repo().countMissedForSchedule("sched-1", "2026-08-01T00:00:00.000Z");
    assert.equal(missed, 2);
  });

  it("lists a day's reminders in time order", async () => {
    await repo().upsert(event("evening", "UPCOMING", { dueAt: "2026-08-25T20:00:00.000Z" }));
    await repo().upsert(event("morning", "UPCOMING", { dueAt: "2026-08-25T08:00:00.000Z" }));
    const day = await repo().listForDay(PATIENT, "2026-08-25T00:00:00.000Z", "2026-08-26T00:00:00.000Z");
    assert.deepEqual(day.map((r) => r.eventId), ["morning", "evening"]);
  });

  it("remembers the scheduled notification so it can be cancelled", async () => {
    await repo().upsert(event("r1", "UPCOMING"));
    await repo().setNotificationId("r1", "notif-abc");
    const stored = await repo().findById("r1");
    assert.equal(stored?.notificationId, "notif-abc");
  });
});

describe("MemoryRepository", () => {
  const repo = () => new MemoryRepository(db);
  const memory = (memoryId: string, overrides: Record<string, unknown> = {}) => ({
    memoryId,
    patientId: PATIENT,
    category: "MY_FAMILY" as const,
    assetType: "PHOTO" as const,
    titleEn: "Daughter",
    consentId: "consent-1",
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  it("caches memories and lists them by category", async () => {
    await repo().replaceAll(PATIENT, [
      memory("m1"),
      memory("m2", { category: "MY_SONGS", assetType: "AUDIO", titleEn: "Bihu song" }),
    ]);
    assert.equal((await repo().listByCategory(PATIENT)).length, 2);
    assert.equal((await repo().listByCategory(PATIENT, "MY_SONGS")).length, 1);
  });

  it("drops assets the server no longer sends, so withdrawn consent takes effect", async () => {
    await repo().replaceAll(PATIENT, [memory("m1"), memory("m2")]);
    await repo().replaceAll(PATIENT, [memory("m1")]);
    const remaining = await repo().listByCategory(PATIENT);
    assert.deepEqual(remaining.map((m) => m.memoryId), ["m1"]);
  });

  it("keeps the patient's favourites across a refresh", async () => {
    await repo().replaceAll(PATIENT, [memory("m1")]);
    await repo().toggleFavourite("m1");
    await repo().replaceAll(PATIENT, [memory("m1")]);
    const [stored] = await repo().listByCategory(PATIENT);
    assert.equal(stored.favourite, true);
  });

  it("toggles a favourite on and off", async () => {
    await repo().replaceAll(PATIENT, [memory("m1")]);
    assert.equal(await repo().toggleFavourite("m1"), true);
    assert.equal(await repo().toggleFavourite("m1"), false);
  });

  it("returns only named people for the Who Is This activity", async () => {
    await repo().replaceAll(PATIENT, [
      memory("person", { personName: "Nabanita", relationshipEn: "Daughter" }),
      memory("place", { category: "MY_PLACES", titleEn: "Tea garden" }),
    ]);
    const people = await repo().listPeople(PATIENT);
    assert.deepEqual(people.map((p) => p.memoryId), ["person"]);
  });

  it("marks a broken asset unavailable rather than losing it", async () => {
    await repo().replaceAll(PATIENT, [memory("m1")]);
    await repo().markUnavailable("m1");
    const [stored] = await repo().listByCategory(PATIENT);
    assert.equal(stored.available, false);
    // It is excluded from the game pool but still present in the gallery.
    assert.equal((await repo().listPeople(PATIENT)).length, 0);
  });
});

describe("ScheduleRepository and ContactRepository", () => {
  it("replaces the cached plan wholesale", async () => {
    const repo = new ScheduleRepository(db);
    const base = {
      patientId: PATIENT,
      titleKey: "myDay.kind.MEDICINE",
      titleEn: "Evening tablet",
      critical: true,
      occurrences: [{ timeOfDay: "20:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }],
      missedAfterMinutes: 45,
      snoozeMinutes: 10,
      version: 1,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    await repo.replaceAll(PATIENT, [{ ...base, scheduleId: "s1", kind: "MEDICINE" }]);
    await repo.replaceAll(PATIENT, [{ ...base, scheduleId: "s2", kind: "MEAL", titleEn: "Lunch" }]);

    const active = await repo.listActive(PATIENT);
    assert.deepEqual(active.map((s) => s.scheduleId), ["s2"]);
    assert.deepEqual(active[0].occurrences, [{ timeOfDay: "20:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }]);
  });

  it("orders contacts and finds the primary ones", async () => {
    const repo = new ContactRepository(db);
    await repo.replaceAll(PATIENT, [
      { contactId: "c2", patientId: PATIENT, name: "Bhaskar", relationshipEn: "Son", phoneNumber: "+917402059715", isPrimary: false, displayOrder: 2 },
      { contactId: "c1", patientId: PATIENT, name: "Nabanita", relationshipEn: "Daughter", phoneNumber: "+911", isPrimary: true, displayOrder: 1 },
    ]);
    const all = await repo.list(PATIENT);
    assert.deepEqual(all.map((c) => c.name), ["Nabanita", "Bhaskar"]);
    assert.deepEqual((await repo.listPrimary(PATIENT)).map((c) => c.name), ["Nabanita"]);
  });

  it("falls back to the first contacts when none are marked primary", async () => {
    const repo = new ContactRepository(db);
    await repo.replaceAll(PATIENT, [
      { contactId: "c1", patientId: PATIENT, name: "A", relationshipEn: "Son", phoneNumber: "+1", isPrimary: false, displayOrder: 1 },
      { contactId: "c2", patientId: PATIENT, name: "B", relationshipEn: "Son", phoneNumber: "+2", isPrimary: false, displayOrder: 2 },
      { contactId: "c3", patientId: PATIENT, name: "C", relationshipEn: "Son", phoneNumber: "+3", isPrimary: false, displayOrder: 3 },
    ]);
    assert.equal((await repo.listPrimary(PATIENT)).length, 2);
  });
});

describe("DifficultyRepository, LanguagePackRepository, SettingsRepository", () => {
  it("stores and updates a difficulty profile", async () => {
    const repo = new DifficultyRepository(db);
    await repo.upsert({ patientId: PATIENT, gameType: "MEMORY_MATCH", currentDifficulty: 2, hintLevel: 1, previewSeconds: 6 });
    await repo.upsert({ patientId: PATIENT, gameType: "MEMORY_MATCH", currentDifficulty: 3, hintLevel: 2, previewSeconds: 5 });

    const stored = await repo.get(PATIENT, "MEMORY_MATCH");
    assert.equal(stored?.currentDifficulty, 3);
    assert.equal(stored?.previewSeconds, 5);
    assert.equal((await repo.list(PATIENT)).length, 1);
  });

  it("returns null for a game with no stored profile", async () => {
    const repo = new DifficultyRepository(db);
    assert.equal(await repo.get(PATIENT, "ROUTINE_BUILDER"), null);
  });

  it("stores a language pack and its audio prompts", async () => {
    const repo = new LanguagePackRepository(db);
    await repo.save({
      language: "as",
      version: 1,
      translations: { "home.playGames": "খেল খেলোঁ" },
      audioPrompts: [{ key: "home.playGames", language: "as" }],
    });
    const pack = await repo.get("as");
    assert.equal(pack?.translations["home.playGames"], "খেল খেলোঁ");
    assert.equal(pack?.audioPrompts.length, 1);
    assert.deepEqual(await repo.listDownloaded(), ["as"]);
  });

  it("stores settings as key/value with boolean helpers", async () => {
    const repo = new SettingsRepository(db);
    await repo.setBoolean("reducedMotion", true);
    assert.equal(await repo.getBoolean("reducedMotion"), true);
    assert.equal(await repo.getBoolean("unknownKey", false), false);
    await repo.set("language", "as");
    assert.equal(await repo.get("language"), "as");
  });
});

describe("DeviceRepository", () => {
  it("keeps exactly one configuration row and merges partial updates", async () => {
    const repo = new DeviceRepository(db);
    await repo.save({ deviceIdentifier: "dev-1", deviceId: DEVICE, patientId: PATIENT, packageVersion: 1 });
    await repo.save({ deviceIdentifier: "dev-1", packageVersion: 2 });

    const rows = await db.getAllAsync("SELECT * FROM device_config");
    assert.equal(rows.length, 1);

    const config = await repo.get();
    assert.equal(config?.packageVersion, 2);
    assert.equal(config?.patientId, PATIENT, "the patient must survive a partial update");
  });

  it("records sync success and failure", async () => {
    const repo = new DeviceRepository(db);
    await repo.save({ deviceIdentifier: "dev-1" });
    await repo.markSyncFailed("network unreachable");
    assert.match((await repo.get())?.lastSyncError ?? "", /network/);

    const at = new Date().toISOString();
    await repo.markSynced(at);
    const config = await repo.get();
    assert.equal(config?.lastSyncAt, at);
    assert.equal(config?.lastSyncError, null, "a success clears the previous error");
  });
});
