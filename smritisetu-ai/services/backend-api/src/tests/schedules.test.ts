import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { api, app, loginAs, pairDevice, resetDatabase, seedFixture, type Fixture } from "./helpers";
import { prisma } from "../lib/prisma";

let fixture: Fixture;
let token: string;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  token = await loginAs(fixture.caregiver.email);
});

const lunch = {
  kind: "MEAL",
  titleEn: "Lunch",
  titleAs: "দুপৰীয়াৰ আহাৰ",
  occurrences: [{ timeOfDay: "13:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }],
};

describe("creating schedules", () => {
  it("creates a schedule at version 1 with a version snapshot", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send(lunch);
    expect(response.status).toBe(201);
    expect(response.body.data.version).toBe(1);

    const versions = await prisma.scheduleVersion.findMany({
      where: { scheduleId: response.body.data.id },
    });
    expect(versions).toHaveLength(1);
    expect(versions[0].changedByUserId).toBe(fixture.caregiver.id);
  });

  it("bumps the patient's package version so devices re-download", async () => {
    const before = await prisma.patientProfile.findUnique({ where: { id: fixture.patient.id } });
    await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send(lunch);
    const after = await prisma.patientProfile.findUnique({ where: { id: fixture.patient.id } });
    expect(after!.packageVersion).toBe(before!.packageVersion + 1);
  });
});

describe("time conflicts", () => {
  it("rejects a same-kind schedule at the same time on overlapping days", async () => {
    const conflicting = {
      kind: "MEDICINE",
      titleEn: "Another evening tablet",
      occurrences: [{ timeOfDay: "20:00", daysOfWeek: [1, 2] }],
    };
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send(conflicting);
    expect(response.status).toBe(409);
    expect(response.body.error.details.conflictingScheduleId).toBe(fixture.schedule.id);
  });

  it("allows the same time for a different kind", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send({ kind: "MEAL", titleEn: "Dinner", occurrences: [{ timeOfDay: "20:00", daysOfWeek: [1] }] });
    expect(response.status).toBe(201);
  });

  it("allows the same kind at a different time", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send({ kind: "MEDICINE", titleEn: "Morning tablet", occurrences: [{ timeOfDay: "08:00", daysOfWeek: [1] }] });
    expect(response.status).toBe(201);
  });

  it("treats an empty daysOfWeek as every day when checking overlap", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send({ kind: "MEDICINE", titleEn: "Clash", occurrences: [{ timeOfDay: "20:00", daysOfWeek: [] }] });
    expect(response.status).toBe(409);
  });
});

describe("versioning and concurrency", () => {
  it("increments the version and appends a snapshot on every edit", async () => {
    await request(app)
      .patch(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ titleEn: "Evening tablet v2", expectedVersion: 1 });

    const updated = await prisma.schedule.findUnique({ where: { id: fixture.schedule.id } });
    expect(updated?.version).toBe(2);

    const versions = await prisma.scheduleVersion.findMany({
      where: { scheduleId: fixture.schedule.id },
      orderBy: { version: "asc" },
    });
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    // The old title survives in history.
    expect(versions[0].titleEn).toBe("Evening tablet");
  });

  it("refuses a concurrent edit rather than silently overwriting a medicine plan", async () => {
    await request(app)
      .patch(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ titleEn: "First editor wins", expectedVersion: 1 });

    const stale = await request(app)
      .patch(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ titleEn: "Second editor loses", expectedVersion: 1 });

    expect(stale.status).toBe(409);
    expect(stale.body.error.details).toMatchObject({
      serverVersion: 2,
      clientVersion: 1,
      resolutionRequired: true,
    });

    const current = await prisma.schedule.findUnique({ where: { id: fixture.schedule.id } });
    expect(current?.titleEn).toBe("First editor wins");
  });

  it("exposes the full version history", async () => {
    await request(app)
      .patch(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({ critical: false, expectedVersion: 1 });

    const response = await request(app)
      .get(`${api}/schedules/${fixture.schedule.id}/versions`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
  });
});

describe("deletion", () => {
  it("soft-deletes and keeps reminder history pointing at a real row", async () => {
    const device = await pairDevice();
    await prisma.reminderEvent.create({
      data: {
        eventId: crypto.randomUUID(),
        patientId: fixture.patient.id,
        deviceId: device.deviceId,
        scheduleId: fixture.schedule.id,
        scheduleVersion: 1,
        kind: "MEDICINE",
        critical: true,
        dueAt: new Date(),
        state: "ACKNOWLEDGED",
        stateChangedAt: new Date(),
      },
    });

    const response = await request(app)
      .delete(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);

    const row = await prisma.schedule.findUnique({ where: { id: fixture.schedule.id } });
    expect(row).not.toBeNull();
    expect(row?.deletedAt).not.toBeNull();
    expect(row?.active).toBe(false);

    const history = await prisma.reminderEvent.count({ where: { scheduleId: fixture.schedule.id } });
    expect(history).toBe(1);
  });

  it("drops a deleted schedule from the list and the offline package", async () => {
    await request(app)
      .delete(`${api}/schedules/${fixture.schedule.id}`)
      .set("authorization", `Bearer ${token}`);

    const list = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`);
    expect(list.body.data).toHaveLength(0);

    const pkg = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/offline-package`)
      .set("authorization", `Bearer ${token}`);
    expect(pkg.body.data.schedules).toHaveLength(0);
  });
});
