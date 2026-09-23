/**
 * End-to-end integration test for the required demo journey.
 *
 * Walks the exact workflow from the specification, from an unpaired device
 * through offline play, a repeatedly missed critical reminder, reconnection,
 * synchronisation, ML evaluation and alert creation.
 *
 * The ML service is stubbed so the test is deterministic and runs with no
 * external process; `services/ml-service/tests` covers the real engine.
 */
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { api, app, loginAs, resetDatabase, seedFixture, type Fixture } from "./helpers";
import { prisma } from "../lib/prisma";
import { mlClient } from "../lib/mlClient";

let fixture: Fixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the required demo journey", () => {
  it("runs end to end: pair, play offline, miss a reminder, reconnect, sync, adapt, alert", async () => {
    /* --- Step 3: pair the device with 123456 ------------------------------ */
    const pairing = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "aita-demo-phone", platform: "android" });

    expect(pairing.status).toBe(201);
    const { deviceToken, deviceId, patientId } = pairing.body.data;
    expect(pairing.body.data.patient.preferredName).toBe("Aita");
    expect(pairing.body.data.patient.preferredLanguage).toBe("as");

    /* --- Step 4: download Aita's Assamese offline package ------------------ */
    const pkg = await request(app)
      .get(`${api}/patients/${patientId}/offline-package`)
      .set("authorization", `Bearer ${deviceToken}`);

    expect(pkg.status).toBe(200);
    expect(pkg.body.data.languagePack.language).toBe("as");
    expect(Object.keys(pkg.body.data.languagePack.translations).length).toBeGreaterThan(100);
    expect(pkg.body.data.languagePack.translations["home.playGames"]).toBeTruthy();
    expect(pkg.body.data.schedules.length).toBeGreaterThan(0);
    expect(pkg.body.data.gameConfig.games).toHaveLength(4);
    // Media is reachable only through a signed, expiring URL.
    for (const memory of pkg.body.data.memories) {
      if (memory.mediaUrl) expect(memory.mediaUrl).toContain("signature=");
    }

    /* --- Steps 5-8: offline play. Two sessions are queued locally ---------- */
    // (The device is offline here; these envelopes are what SQLite holds.)
    const playedAt = new Date().toISOString();
    const memoryMatchEvent = {
      eventId: randomUUID(),
      patientId,
      deviceId,
      eventType: "GAME_SESSION",
      eventTimestamp: playedAt,
      payloadVersion: 1,
      localCreatedAt: playedAt,
      payload: {
        gameType: "MEMORY_MATCH",
        difficulty: 2,
        accuracy: 0.83,
        responseTimeSeconds: 9.1,
        hintsUsed: 1,
        attempts: 9,
        completed: true,
        abandoned: false,
        engagementDurationSeconds: 210,
        playedAt,
        detail: { matchedPairs: 3, totalPairs: 3 },
      },
    };
    const whoIsThisEvent = {
      eventId: randomUUID(),
      patientId,
      deviceId,
      eventType: "GAME_SESSION",
      eventTimestamp: playedAt,
      payloadVersion: 1,
      localCreatedAt: new Date(Date.parse(playedAt) + 1000).toISOString(),
      payload: {
        gameType: "WHO_IS_THIS",
        difficulty: 2,
        accuracy: 1.0,
        responseTimeSeconds: 6.4,
        hintsUsed: 0,
        attempts: 1,
        completed: true,
        abandoned: false,
        engagementDurationSeconds: 95,
        playedAt,
        detail: { selectedAnswerId: "nabanita", correctAnswerId: "nabanita" },
      },
    };

    /* --- Steps 9-11: a critical medicine reminder is missed repeatedly ----- */
    const missedEvents = [0, 1].map((dayOffset) => {
      const dueAt = new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000);
      dueAt.setHours(20, 0, 0, 0);
      return {
        eventId: randomUUID(),
        patientId,
        deviceId,
        eventType: "REMINDER_EVENT",
        eventTimestamp: dueAt.toISOString(),
        payloadVersion: 1,
        localCreatedAt: new Date(dueAt.getTime() + 45 * 60 * 1000).toISOString(),
        payload: {
          scheduleId: fixture.schedule.id,
          scheduleVersion: 1,
          dueAt: dueAt.toISOString(),
          state: "MISSED",
          stateChangedAt: new Date(dueAt.getTime() + 45 * 60 * 1000).toISOString(),
          snoozeCount: 1,
          helpRequested: false,
        },
      };
    });

    /* --- Steps 12-16: connectivity is restored and everything syncs -------- */
    vi.spyOn(mlClient, "recommendDifficulty").mockResolvedValue({
      recommended_difficulty: 3,
      hint_level: 1,
      recommended_game_type: "MEMORY_MATCH",
      reason_code: "ACCURACY_ABOVE_THRESHOLD",
      explanation: "The last three comparable sessions were around 85%, so the level moves up gently to 3.",
      confidence: 0.85,
      evidence_session_count: 3,
      model_version: "rules-1.0.0",
    });

    const events = [memoryMatchEvent, whoIsThisEvent, ...missedEvents];
    const sync = await request(app)
      .post(`${api}/sync/events`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ events, clientPackageVersion: pkg.body.data.packageVersion });

    expect(sync.status).toBe(200);
    expect(sync.body.data.accepted).toHaveLength(4);
    expect(sync.body.data.rejected).toHaveLength(0);
    expect(sync.body.data.conflicts).toHaveLength(0);

    // Both game sessions are stored in the backend.
    const storedSessions = await prisma.gameSession.findMany({ where: { patientId } });
    expect(storedSessions.map((s) => s.gameType).sort()).toEqual(["MEMORY_MATCH", "WHO_IS_THIS"]);

    /* --- Step 14: the backend prevents duplicates ------------------------- */
    const replay = await request(app)
      .post(`${api}/sync/events`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ events, clientPackageVersion: pkg.body.data.packageVersion });

    expect(replay.body.data.accepted).toHaveLength(0);
    expect(replay.body.data.duplicates).toHaveLength(4);
    expect(await prisma.gameSession.count({ where: { patientId } })).toBe(2);
    expect(await prisma.reminderEvent.count({ where: { patientId } })).toBe(2);

    /* --- Steps 15-16: the ML recommendation is evaluated and stored -------- */
    const profile = await prisma.difficultyProfile.findUnique({
      where: { patientId_gameType: { patientId, gameType: "MEMORY_MATCH" } },
    });
    expect(profile?.currentDifficulty).toBe(3);
    expect(profile?.reasonCode).toBe("ACCURACY_ABOVE_THRESHOLD");
    expect(profile?.explanation).toBeTruthy();

    const decision = await prisma.adaptationDecision.findFirst({
      where: { patientId, gameType: "MEMORY_MATCH" },
    });
    expect(decision?.previousDifficulty).toBe(2);
    expect(decision?.recommendedDifficulty).toBe(3);
    expect(decision?.evidence).toBeTruthy();

    /* --- Step 17: an explainable missed-reminder alert is created ---------- */
    const caregiverToken = await loginAs(fixture.caregiver.email);
    const alerts = await request(app)
      .get(`${api}/patients/${patientId}/alerts`)
      .set("authorization", `Bearer ${caregiverToken}`);

    expect(alerts.status).toBe(200);
    const missedAlert = alerts.body.data.find(
      (a: { type: string }) => a.type === "MISSED_CRITICAL_REMINDER",
    );
    expect(missedAlert).toBeDefined();
    expect(missedAlert.severity).toBe("IMPORTANT");
    expect(missedAlert.evidence.missedCount).toBe(2);
    expect(missedAlert.explanation).toMatch(/not marked as done/i);
    expect(missedAlert.isDiagnosis).toBe(false);
    // No claim is ever made about what the patient actually consumed.
    expect(missedAlert.explanation.toLowerCase()).not.toContain("did not take");

    // Replaying the batch must not raise a second alert for the same condition.
    expect(
      alerts.body.data.filter((a: { type: string }) => a.type === "MISSED_CRITICAL_REMINDER"),
    ).toHaveLength(1);

    /* --- Step 18: the app can show a successful synchronisation ------------ */
    const status = await request(app)
      .get(`${api}/sync/status/${deviceId}`)
      .set("authorization", `Bearer ${deviceToken}`);

    expect(status.status).toBe(200);
    expect(status.body.data.lastSyncAt).toBeTruthy();
    expect(status.body.data.acceptedEventCount).toBe(4);
    expect(status.body.data.patientId).toBe(patientId);

    /* --- The device picks up its new difficulty on the next config fetch --- */
    const config = await request(app)
      .get(`${api}/patients/${patientId}/game-config`)
      .set("authorization", `Bearer ${deviceToken}`);
    const memoryMatch = config.body.data.games.find(
      (g: { gameType: string }) => g.gameType === "MEMORY_MATCH",
    );
    expect(memoryMatch.difficulty).toBe(3);
    // Level 3 still previews the cards, just for less time.
    expect(memoryMatch.previewSeconds).toBeGreaterThan(0);
  });

  it("keeps working end to end when the ML service is unreachable", async () => {
    vi.spyOn(mlClient, "recommendDifficulty").mockResolvedValue(null);
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(null);

    const pairing = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "aita-no-ml-phone" });
    const { deviceToken, deviceId, patientId } = pairing.body.data;

    const now = new Date().toISOString();
    const sync = await request(app)
      .post(`${api}/sync/events`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({
        events: [
          {
            eventId: randomUUID(),
            patientId,
            deviceId,
            eventType: "GAME_SESSION",
            eventTimestamp: now,
            payloadVersion: 1,
            localCreatedAt: now,
            payload: {
              gameType: "MEMORY_MATCH",
              difficulty: 2,
              accuracy: 0.95,
              responseTimeSeconds: 7,
              hintsUsed: 0,
              attempts: 6,
              completed: true,
              abandoned: false,
              engagementDurationSeconds: 150,
              playedAt: now,
            },
          },
        ],
      });

    // Sync still succeeds; the session is stored; difficulty simply holds.
    expect(sync.status).toBe(200);
    expect(sync.body.data.accepted).toHaveLength(1);

    const profile = await prisma.difficultyProfile.findUnique({
      where: { patientId_gameType: { patientId, gameType: "MEMORY_MATCH" } },
    });
    // Difficulty holds at whatever the patient was already playing.
    expect(profile?.currentDifficulty).toBe(2);
    expect(profile?.reasonCode).toBe("ML_UNAVAILABLE_EVALUATION_QUEUED");

    // And the patient can still fetch a playable configuration.
    const config = await request(app)
      .get(`${api}/patients/${patientId}/game-config`)
      .set("authorization", `Bearer ${deviceToken}`);
    expect(config.status).toBe(200);
    expect(config.body.data.games.every((g: { enabled: boolean }) => g.enabled)).toBe(true);
  });

  it("records an I-Need-Help request as an urgent, deduplicated alert", async () => {
    const pairing = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "aita-help-phone" });
    const { deviceToken, deviceId, patientId } = pairing.body.data;

    const now = new Date().toISOString();
    const helpEvent = (id: string) => ({
      eventId: id,
      patientId,
      deviceId,
      eventType: "HELP_REQUEST",
      eventTimestamp: now,
      payloadVersion: 1,
      localCreatedAt: now,
      payload: { requestedAt: now, context: "home_screen" },
    });

    const first = await request(app)
      .post(`${api}/sync/events`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ events: [helpEvent(randomUUID())] });
    expect(first.body.data.accepted).toHaveLength(1);

    // A second, distinct help request in the same hour must not double-alert.
    await request(app)
      .post(`${api}/sync/events`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ events: [helpEvent(randomUUID())] });

    const alerts = await prisma.alert.findMany({ where: { patientId, type: "HELP_REQUESTED" } });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("URGENT");
    expect(alerts[0].explanation).toMatch(/not an emergency service/i);
  });
});
