import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import {
  api,
  app,
  envelope,
  gameSessionPayload,
  loginAs,
  pairDevice,
  resetDatabase,
  seedFixture,
  type Fixture,
} from "./helpers";
import { prisma } from "../lib/prisma";

let fixture: Fixture;
let device: Awaited<ReturnType<typeof pairDevice>>;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  device = await pairDevice();
});

function gameEvent(overrides: Record<string, unknown> = {}) {
  const { payload, ...envelopeOverrides } = overrides;
  return {
    ...envelope(),
    patientId: device.patientId,
    deviceId: device.deviceId,
    eventType: "GAME_SESSION",
    ...envelopeOverrides,
    payload: payload ?? gameSessionPayload(),
  };
}

function reminderEvent(state: string, overrides: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  // Pull payload out so envelope overrides cannot clobber the merged payload.
  const { payload: payloadOverrides, ...envelopeOverrides } = overrides;
  return {
    ...envelope(),
    patientId: device.patientId,
    deviceId: device.deviceId,
    eventType: "REMINDER_EVENT",
    ...envelopeOverrides,
    payload: {
      scheduleId: fixture.schedule.id,
      scheduleVersion: 1,
      dueAt: now,
      state,
      stateChangedAt: now,
      snoozeCount: 0,
      helpRequested: false,
      ...((payloadOverrides as object) ?? {}),
    },
  };
}

async function sync(events: unknown[], token = device.deviceToken) {
  return request(app)
    .post(`${api}/sync/events`)
    .set("authorization", `Bearer ${token}`)
    .send({ events, clientPackageVersion: 1 });
}

describe("event idempotency", () => {
  it("accepts a new event", async () => {
    const response = await sync([gameEvent()]);
    expect(response.status).toBe(200);
    expect(response.body.data.accepted).toHaveLength(1);
    expect(response.body.data.duplicates).toHaveLength(0);
  });

  it("reports a replayed event as a duplicate and stores it only once", async () => {
    const event = gameEvent();
    await sync([event]);
    const replay = await sync([event]);

    expect(replay.body.data.accepted).toHaveLength(0);
    expect(replay.body.data.duplicates).toEqual([event.eventId]);

    const stored = await prisma.gameSession.count({ where: { eventId: event.eventId } });
    expect(stored).toBe(1);
  });

  it("deduplicates repeats inside a single batch", async () => {
    const event = gameEvent();
    const response = await sync([event, event, event]);
    expect(response.body.data.accepted).toHaveLength(1);
    expect(response.body.data.duplicates).toHaveLength(2);
    expect(await prisma.gameSession.count({ where: { eventId: event.eventId } })).toBe(1);
  });

  it("treats the same eventId from a different device as a separate event", async () => {
    const otherDevice = await prisma.device.create({
      data: {
        patientId: device.patientId,
        deviceIdentifier: "second-device",
        tokenHash: "x",
        tokenExpiresAt: new Date(Date.now() + 1000),
      },
    });
    const sharedId = randomUUID();
    await sync([gameEvent({ eventId: sharedId })]);
    await prisma.gameSession.create({
      data: {
        eventId: sharedId,
        patientId: device.patientId,
        deviceId: otherDevice.id,
        gameType: "MEMORY_MATCH",
        difficulty: 1,
        responseTimeSeconds: 1,
        playedAt: new Date(),
      },
    });
    expect(await prisma.gameSession.count({ where: { eventId: sharedId } })).toBe(2);
  });
});

describe("partial success", () => {
  it("accepts the good events and rejects only the bad ones", async () => {
    const good = gameEvent();
    const bad = gameEvent({ payload: gameSessionPayload({ difficulty: 99, accuracy: 7 }) });
    const alsoGood = gameEvent();

    const response = await sync([good, bad, alsoGood]);
    expect(response.status).toBe(200);
    expect(response.body.data.accepted.sort()).toEqual([good.eventId, alsoGood.eventId].sort());
    expect(response.body.data.rejected).toHaveLength(1);
    expect(response.body.data.rejected[0].eventId).toBe(bad.eventId);
    expect(response.body.data.rejected[0].code).toBe("INVALID_GAME_SESSION");
    expect(response.body.data.rejected[0].message).toBeTruthy();
  });

  it("rejects an event belonging to another patient without dropping the batch", async () => {
    const mine = gameEvent();
    const theirs = gameEvent({ patientId: fixture.unassignedPatient.id });
    const response = await sync([mine, theirs]);
    expect(response.body.data.accepted).toEqual([mine.eventId]);
    expect(response.body.data.rejected[0].code).toBe("PATIENT_MISMATCH");
  });

  it("rejects a reminder for an unknown schedule", async () => {
    const response = await sync([
      reminderEvent("ACKNOWLEDGED", {
        payload: { scheduleId: "00000000-0000-4000-8000-000000000000" },
      }),
    ]);
    expect(response.body.data.rejected[0].code).toBe("UNKNOWN_SCHEDULE");
  });

  it("returns every event in exactly one outcome bucket", async () => {
    const events = [gameEvent(), gameEvent({ payload: gameSessionPayload({ difficulty: 0 }) }), gameEvent()];
    const response = await sync(events);
    const { accepted, duplicates, rejected, conflicts } = response.body.data;
    const total = accepted.length + duplicates.length + rejected.length + conflicts.length;
    expect(total).toBe(events.length);
  });

  it("always returns the server time", async () => {
    const response = await sync([gameEvent()]);
    expect(Number.isNaN(Date.parse(response.body.data.serverTime))).toBe(false);
  });
});

describe("schedule conflicts", () => {
  it("reports a conflict when the device used an outdated medicine schedule version", async () => {
    // Caregiver edits the medicine schedule -> version 2.
    const token = await loginAs(fixture.caregiver.email);
    const patched = await request(app)
      .patch(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ titleEn: "Evening tablet (updated)", expectedVersion: 1 });
    expect(patched.status).toBe(200);

    // The offline device still holds version 1.
    const response = await sync([reminderEvent("ACKNOWLEDGED", { payload: { scheduleVersion: 1 } })]);
    expect(response.body.data.conflicts).toHaveLength(1);
    expect(response.body.data.conflicts[0]).toMatchObject({
      serverVersion: 2,
      clientVersion: 1,
      resolutionRequired: true,
    });
  });

  it("still stores the conflicting reminder — real history is never discarded", async () => {
    const token = await loginAs(fixture.caregiver.email);
    await request(app)
      .patch(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ titleEn: "Changed", expectedVersion: 1 });

    const event = reminderEvent("ACKNOWLEDGED", { payload: { scheduleVersion: 1 } });
    await sync([event]);
    const stored = await prisma.reminderEvent.findFirst({ where: { eventId: event.eventId } });
    expect(stored).not.toBeNull();
    expect(stored?.scheduleVersion).toBe(1);
  });

  it("accepts a reminder that matches the current schedule version", async () => {
    const response = await sync([reminderEvent("ACKNOWLEDGED", { payload: { scheduleVersion: 1 } })]);
    expect(response.body.data.conflicts).toHaveLength(0);
    expect(response.body.data.accepted).toHaveLength(1);
  });
});

describe("append-only guarantees", () => {
  it("stores each reminder state transition as its own row", async () => {
    const dueAt = new Date().toISOString();
    await sync([
      reminderEvent("DUE", { payload: { dueAt } }),
      reminderEvent("SNOOZED", { payload: { dueAt, snoozeCount: 1 } }),
      reminderEvent("ACKNOWLEDGED", { payload: { dueAt } }),
    ]);
    const rows = await prisma.reminderEvent.findMany({
      where: { scheduleId: fixture.schedule.id },
      orderBy: { receivedAt: "asc" },
    });
    expect(rows.map((r) => r.state)).toEqual(["DUE", "SNOOZED", "ACKNOWLEDGED"]);
  });

  it("keeps a full envelope record of every event, accepted or not", async () => {
    const good = gameEvent();
    const bad = gameEvent({ payload: gameSessionPayload({ difficulty: 99 }) });
    await sync([good, bad]);
    const envelopes = await prisma.syncEvent.findMany({ where: { deviceId: device.deviceId } });
    expect(envelopes).toHaveLength(2);
    expect(envelopes.find((e) => e.eventId === bad.eventId)?.status).toBe("REJECTED");
  });
});

describe("ordering and package version", () => {
  it("ingests events in local creation order regardless of array order", async () => {
    const older = gameEvent({ localCreatedAt: new Date(Date.now() - 60_000).toISOString() });
    const newer = gameEvent({ localCreatedAt: new Date().toISOString() });
    await sync([newer, older]);
    const rows = await prisma.syncEvent.findMany({
      where: { deviceId: device.deviceId },
      orderBy: { receivedAt: "asc" },
    });
    expect(rows[0].eventId).toBe(older.eventId);
  });

  it("advertises a newer package version when the device is behind", async () => {
    await prisma.patientProfile.update({
      where: { id: device.patientId },
      data: { packageVersion: 7 },
    });
    const response = await sync([gameEvent()]);
    expect(response.body.data.nextPackageVersion).toBe(7);
  });

  it("omits nextPackageVersion when the device is current", async () => {
    const response = await sync([gameEvent()]);
    expect(response.body.data.nextPackageVersion).toBeUndefined();
  });

  it("updates the device's last sync time", async () => {
    await sync([gameEvent()]);
    const status = await request(app)
      .get(`${api}/sync/status/${device.deviceId}`)
      .set("authorization", `Bearer ${device.deviceToken}`);
    expect(status.status).toBe(200);
    expect(status.body.data.lastSyncAt).toBeTruthy();
    expect(status.body.data.acceptedEventCount).toBeGreaterThan(0);
  });
});

describe("sync authentication", () => {
  it("rejects a batch with no device token", async () => {
    const response = await request(app).post(`${api}/sync/events`).send({ events: [gameEvent()] });
    expect(response.status).toBe(401);
  });

  it("rejects an empty batch", async () => {
    const response = await sync([]);
    expect(response.status).toBe(422);
  });

  it("rejects a batch larger than the limit", async () => {
    const events = Array.from({ length: 201 }, () => gameEvent());
    const response = await sync(events);
    expect(response.status).toBe(422);
  });
});
