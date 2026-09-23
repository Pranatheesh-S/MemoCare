import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { api, app, loginAs, pairDevice, resetDatabase, seedFixture, type Fixture } from "./helpers";
import { prisma } from "../lib/prisma";
import {
  evaluateGameAbandonment,
  evaluateHelpRequest,
  evaluateInactivity,
  evaluateMissedCriticalReminders,
  raiseAlert,
} from "../services/alertEngine";

let fixture: Fixture;
let device: Awaited<ReturnType<typeof pairDevice>>;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  device = await pairDevice();
});

async function recordMissedReminder(hoursAgo: number) {
  const dueAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  return prisma.reminderEvent.create({
    data: {
      eventId: crypto.randomUUID(),
      patientId: fixture.patient.id,
      deviceId: device.deviceId,
      scheduleId: fixture.schedule.id,
      scheduleVersion: 1,
      kind: "MEDICINE",
      critical: true,
      dueAt,
      state: "MISSED",
      stateChangedAt: new Date(dueAt.getTime() + 45 * 60 * 1000),
    },
  });
}

describe("missed critical reminders", () => {
  it("raises nothing below the threshold", async () => {
    await recordMissedReminder(24);
    const result = await evaluateMissedCriticalReminders(fixture.patient.id, fixture.schedule.id);
    expect(result).toBeNull();
  });

  it("raises an alert once the threshold is reached", async () => {
    await recordMissedReminder(24);
    await recordMissedReminder(48);
    const result = await evaluateMissedCriticalReminders(fixture.patient.id, fixture.schedule.id);
    expect(result?.created).toBe(true);

    const alert = await prisma.alert.findFirst({ where: { patientId: fixture.patient.id } });
    expect(alert?.type).toBe("MISSED_CRITICAL_REMINDER");
    expect(alert?.severity).toBe("IMPORTANT");
    expect(alert?.evidence).toMatchObject({ missedCount: 2 });
    expect(alert?.ruleVersion).toBeTruthy();
  });

  it("never claims the medicine was not taken — only that it was not marked done", async () => {
    await recordMissedReminder(24);
    await recordMissedReminder(48);
    await evaluateMissedCriticalReminders(fixture.patient.id, fixture.schedule.id);
    const alert = await prisma.alert.findFirst({ where: { patientId: fixture.patient.id } });
    expect(alert?.explanation).toMatch(/not marked as done/i);
    expect(alert?.explanation.toLowerCase()).not.toContain("did not take");
    expect(alert?.explanation.toLowerCase()).not.toContain("dementia");
  });

  it("discounts a miss that was later acknowledged for the same due time", async () => {
    const missed = await recordMissedReminder(24);
    await recordMissedReminder(48);
    await prisma.reminderEvent.create({
      data: {
        eventId: crypto.randomUUID(),
        patientId: fixture.patient.id,
        deviceId: device.deviceId,
        scheduleId: fixture.schedule.id,
        scheduleVersion: 1,
        kind: "MEDICINE",
        critical: true,
        dueAt: missed.dueAt,
        state: "ACKNOWLEDGED",
        stateChangedAt: new Date(),
      },
    });
    const result = await evaluateMissedCriticalReminders(fixture.patient.id, fixture.schedule.id);
    expect(result).toBeNull();
  });
});

describe("deduplication", () => {
  it("does not create a second alert for the same unresolved condition", async () => {
    await recordMissedReminder(24);
    await recordMissedReminder(48);

    const first = await evaluateMissedCriticalReminders(fixture.patient.id, fixture.schedule.id);
    const second = await evaluateMissedCriticalReminders(fixture.patient.id, fixture.schedule.id);

    expect(first?.created).toBe(true);
    expect(second?.created).toBe(false);
    expect(second?.reason).toBe("DUPLICATE_OPEN_CONDITION");
    expect(await prisma.alert.count({ where: { patientId: fixture.patient.id } })).toBe(1);
  });

  it("keeps deduplicating while the alert is only acknowledged", async () => {
    const raised = await raiseAlert({
      patientId: fixture.patient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: {},
      explanation: "Test",
      dedupeKey: "TEST:1",
    });
    await prisma.alert.update({ where: { id: raised.alertId }, data: { status: "ACKNOWLEDGED" } });

    const again = await raiseAlert({
      patientId: fixture.patient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: {},
      explanation: "Test",
      dedupeKey: "TEST:1",
    });
    expect(again.created).toBe(false);
  });

  it("allows a fresh alert once the previous one is resolved", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const raised = await raiseAlert({
      patientId: fixture.patient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: {},
      explanation: "Test",
      dedupeKey: "TEST:2",
    });

    const resolve = await request(app)
      .post(`${api}/alerts/${raised.alertId}/resolve`)
      .set("authorization", `Bearer ${token}`)
      .send({ resolutionNote: "Spoke to Aita, all well" });
    expect(resolve.status).toBe(200);

    const again = await raiseAlert({
      patientId: fixture.patient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: {},
      explanation: "Test",
      dedupeKey: "TEST:2",
    });
    expect(again.created).toBe(true);
    expect(await prisma.alert.count({ where: { patientId: fixture.patient.id } })).toBe(2);
  });

  it("keeps deduplication per patient, not global", async () => {
    await raiseAlert({
      patientId: fixture.patient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: {},
      explanation: "Test",
      dedupeKey: "SHARED",
    });
    const other = await raiseAlert({
      patientId: fixture.unassignedPatient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: {},
      explanation: "Test",
      dedupeKey: "SHARED",
    });
    expect(other.created).toBe(true);
  });
});

describe("other alert rules", () => {
  it("raises an urgent alert when the patient asks for help", async () => {
    const result = await evaluateHelpRequest(fixture.patient.id, new Date(), "home_screen");
    expect(result.created).toBe(true);
    const alert = await prisma.alert.findFirst({ where: { type: "HELP_REQUESTED" } });
    expect(alert?.severity).toBe("URGENT");
    expect(alert?.explanation).toMatch(/not an emergency service/i);
  });

  it("assigns the alert to the primary caregiver", async () => {
    await evaluateHelpRequest(fixture.patient.id, new Date());
    const alert = await prisma.alert.findFirst({ where: { type: "HELP_REQUESTED" } });
    expect(alert?.assignedUserId).toBe(fixture.caregiver.id);
  });

  it("raises an inactivity alert only after the configured window", async () => {
    await prisma.gameSession.create({
      data: {
        eventId: crypto.randomUUID(),
        patientId: fixture.patient.id,
        deviceId: device.deviceId,
        gameType: "MEMORY_MATCH",
        difficulty: 1,
        responseTimeSeconds: 5,
        playedAt: new Date(),
      },
    });
    expect(await evaluateInactivity(fixture.patient.id)).toBeNull();

    await prisma.gameSession.updateMany({
      where: { patientId: fixture.patient.id },
      data: { playedAt: new Date(Date.now() - 120 * 60 * 60 * 1000) },
    });
    const result = await evaluateInactivity(fixture.patient.id);
    expect(result?.created).toBe(true);
  });

  it("raises an abandonment alert only at the threshold", async () => {
    for (let i = 0; i < 2; i++) {
      await prisma.gameSession.create({
        data: {
          eventId: crypto.randomUUID(),
          patientId: fixture.patient.id,
          deviceId: device.deviceId,
          gameType: "MEMORY_MATCH",
          difficulty: 1,
          responseTimeSeconds: 5,
          abandoned: true,
          playedAt: new Date(),
        },
      });
    }
    expect(await evaluateGameAbandonment(fixture.patient.id)).toBeNull();

    await prisma.gameSession.create({
      data: {
        eventId: crypto.randomUUID(),
        patientId: fixture.patient.id,
        deviceId: device.deviceId,
        gameType: "MEMORY_MATCH",
        difficulty: 1,
        responseTimeSeconds: 5,
        abandoned: true,
        playedAt: new Date(),
      },
    });
    const result = await evaluateGameAbandonment(fixture.patient.id);
    expect(result?.created).toBe(true);
  });
});

describe("alert lifecycle API", () => {
  async function openAlert() {
    return raiseAlert({
      patientId: fixture.patient.id,
      type: "NO_ACTIVITY",
      severity: "ATTENTION",
      evidence: { hoursSinceActivity: 50 },
      explanation: "There has been no app activity for about 50 hours.",
      dedupeKey: `LIFECYCLE:${crypto.randomUUID()}`,
    });
  }

  it("lists alerts for an assigned caregiver", async () => {
    await openAlert();
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/alerts`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].isDiagnosis).toBe(false);
    expect(response.body.data[0].explanation).toBeTruthy();
    expect(response.body.data[0].ruleVersion).toBeTruthy();
  });

  it("acknowledges an alert and records who did it", async () => {
    const alert = await openAlert();
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .post(`${api}/alerts/${alert.alertId}/acknowledge`)
      .set("authorization", `Bearer ${token}`)
      .send({ note: "Calling now" });
    expect(response.status).toBe(200);

    const stored = await prisma.alert.findUnique({ where: { id: alert.alertId } });
    expect(stored?.status).toBe("ACKNOWLEDGED");
    expect(stored?.acknowledgedByUserId).toBe(fixture.caregiver.id);
    expect(stored?.acknowledgedAt).toBeTruthy();
  });

  it("escalates severity by one step, never past URGENT", async () => {
    const alert = await openAlert();
    const token = await loginAs(fixture.caregiver.email);

    for (const expected of ["IMPORTANT", "URGENT", "URGENT"]) {
      const response = await request(app)
        .post(`${api}/alerts/${alert.alertId}/escalate`)
        .set("authorization", `Bearer ${token}`)
        .send({});
      expect(response.body.data.severity).toBe(expected);
    }
  });

  it("requires a resolution note", async () => {
    const alert = await openAlert();
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .post(`${api}/alerts/${alert.alertId}/resolve`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
  });

  it("refuses to acknowledge an already resolved alert", async () => {
    const alert = await openAlert();
    const token = await loginAs(fixture.caregiver.email);
    await request(app)
      .post(`${api}/alerts/${alert.alertId}/resolve`)
      .set("authorization", `Bearer ${token}`)
      .send({ resolutionNote: "Done" });
    const response = await request(app)
      .post(`${api}/alerts/${alert.alertId}/acknowledge`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(409);
  });

  it("blocks an unassigned caregiver from acting on an alert", async () => {
    const alert = await openAlert();
    const token = await loginAs(fixture.otherCaregiver.email);
    const response = await request(app)
      .post(`${api}/alerts/${alert.alertId}/acknowledge`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(403);
  });
});
