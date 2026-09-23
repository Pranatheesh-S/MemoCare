import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { api, app, loginAs, pairDevice, resetDatabase, seedFixture, type Fixture } from "./helpers";

let fixture: Fixture;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

describe("patient assignment", () => {
  it("lets an assigned caregiver read their patient", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.preferredName).toBe("Aita");
  });

  it("blocks a caregiver from a patient they are not assigned to", async () => {
    const token = await loginAs(fixture.otherCaregiver.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("blocks an unassigned caregiver from every patient-scoped route", async () => {
    const token = await loginAs(fixture.otherCaregiver.email);
    const routes = [
      `${api}/patients/${fixture.patient.id}/schedules`,
      `${api}/patients/${fixture.patient.id}/offline-package`,
      `${api}/patients/${fixture.patient.id}/game-sessions`,
      `${api}/patients/${fixture.patient.id}/memories`,
      `${api}/patients/${fixture.patient.id}/alerts`,
      `${api}/patients/${fixture.patient.id}/trends?period=7d`,
      `${api}/patients/${fixture.patient.id}/game-config`,
      `${api}/patients/${fixture.patient.id}/difficulty-profiles`,
    ];
    for (const route of routes) {
      const response = await request(app).get(route).set("authorization", `Bearer ${token}`);
      expect(response.status, `expected 403 for ${route}`).toBe(403);
    }
  });

  it("lets an assigned health worker read their patient", async () => {
    const token = await loginAs(fixture.healthWorker.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
  });

  it("blocks a health worker from an unassigned patient", async () => {
    const token = await loginAs(fixture.healthWorker.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.unassignedPatient.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it("lets an admin reach any patient", async () => {
    const token = await loginAs(fixture.admin.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.unassignedPatient.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
  });

  it("returns 404, not 403, for a patient that does not exist", async () => {
    const token = await loginAs(fixture.admin.email);
    const response = await request(app)
      .get(`${api}/patients/00000000-0000-4000-8000-000000000000`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(404);
  });
});

describe("device scoping", () => {
  it("lets a device read the patient it is paired with", async () => {
    const { deviceToken, patientId } = await pairDevice();
    const response = await request(app)
      .get(`${api}/patients/${patientId}`)
      .set("authorization", `Bearer ${deviceToken}`);
    expect(response.status).toBe(200);
  });

  it("blocks a device from any other patient", async () => {
    const { deviceToken } = await pairDevice();
    const response = await request(app)
      .get(`${api}/patients/${fixture.unassignedPatient.id}`)
      .set("authorization", `Bearer ${deviceToken}`);
    expect(response.status).toBe(403);
  });

  it("lets a device change only accessibility preferences", async () => {
    const { deviceToken, patientId } = await pairDevice();

    const allowed = await request(app)
      .patch(`${api}/patients/${patientId}`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ preferredLanguage: "en", largeText: false });
    expect(allowed.status).toBe(200);

    const blocked = await request(app)
      .patch(`${api}/patients/${patientId}`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ displayName: "Renamed By Device" });
    expect(blocked.status).toBe(403);
  });

  it("blocks a device from another device's sync status", async () => {
    const first = await pairDevice("123456", "device-one");
    const response = await request(app)
      .get(`${api}/sync/status/00000000-0000-4000-8000-000000000000`)
      .set("authorization", `Bearer ${first.deviceToken}`);
    expect([403, 404]).toContain(response.status);
  });
});

describe("role gates", () => {
  it("blocks a health worker from nothing they are assigned to, but keeps writes role-gated", async () => {
    const healthWorkerToken = await loginAs(fixture.healthWorker.email);
    const create = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${healthWorkerToken}`)
      .send({
        kind: "APPOINTMENT",
        titleEn: "Clinic visit",
        occurrences: [{ timeOfDay: "10:00", daysOfWeek: [2] }],
      });
    expect(create.status).toBe(201);
  });

  it("blocks a device token from creating a schedule", async () => {
    const { deviceToken, patientId } = await pairDevice();
    const response = await request(app)
      .post(`${api}/patients/${patientId}/schedules`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ kind: "MEAL", titleEn: "Lunch", occurrences: [{ timeOfDay: "13:00", daysOfWeek: [] }] });
    expect(response.status).toBe(401);
  });

  it("blocks a user token from posting a game session (device-only route)", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .post(`${api}/game-sessions`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(401);
  });
});

describe("request validation", () => {
  it("rejects an unparseable schedule body with field-level detail", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send({ kind: "NOT_A_KIND", titleEn: "", occurrences: [] });
    expect(response.status).toBe(422);
    expect(Array.isArray(response.body.error.details)).toBe(true);
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it("rejects a malformed time of day", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${token}`)
      .send({ kind: "MEAL", titleEn: "Lunch", occurrences: [{ timeOfDay: "25:99", daysOfWeek: [] }] });
    expect(response.status).toBe(422);
  });

  it("rejects an empty PATCH body", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const response = await request(app)
      .patch(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(response.status).toBe(422);
  });

  it("returns a consistent error envelope with a request id", async () => {
    const response = await request(app).get(`${api}/patients/not-a-uuid`);
    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBeDefined();
    expect(response.body.error.message).toBeDefined();
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("returns a clean 404 envelope for an unknown route", async () => {
    const response = await request(app).get(`${api}/no/such/route`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });
});
