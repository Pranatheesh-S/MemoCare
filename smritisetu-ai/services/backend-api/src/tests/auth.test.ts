import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { api, app, loginAs, pairDevice, resetDatabase, seedFixture, type Fixture } from "./helpers";
import { prisma } from "../lib/prisma";

let fixture: Fixture;

beforeAll(async () => {
  await resetDatabase();
});

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
});

describe("registration", () => {
  it("creates a caregiver and returns a session", async () => {
    const response = await request(app).post(`${api}/auth/register`).send({
      email: "new.caregiver@test.local",
      password: "StrongPass#1",
      fullName: "New Caregiver",
      role: "CAREGIVER",
    });
    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe("CAREGIVER");
    expect(response.body.data.tokens.accessToken).toBeTruthy();
  });

  it("refuses to register a PATIENT — patients are paired, never registered", async () => {
    const response = await request(app).post(`${api}/auth/register`).send({
      email: "patient@test.local",
      password: "StrongPass#1",
      fullName: "Patient",
      role: "PATIENT",
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a weak password", async () => {
    const response = await request(app).post(`${api}/auth/register`).send({
      email: "weak@test.local",
      password: "short",
      fullName: "Weak",
      role: "CAREGIVER",
    });
    expect(response.status).toBe(422);
  });

  it("rejects a duplicate email", async () => {
    const response = await request(app).post(`${api}/auth/register`).send({
      email: fixture.caregiver.email,
      password: "StrongPass#1",
      fullName: "Duplicate",
      role: "CAREGIVER",
    });
    expect(response.status).toBe(409);
  });

  it("never stores the password in clear text", async () => {
    await request(app).post(`${api}/auth/register`).send({
      email: "hashcheck@test.local",
      password: "StrongPass#1",
      fullName: "Hash Check",
      role: "CAREGIVER",
    });
    const user = await prisma.user.findUnique({ where: { email: "hashcheck@test.local" } });
    expect(user?.passwordHash).not.toBe("StrongPass#1");
    expect(user?.passwordHash.startsWith("$2")).toBe(true);
  });
});

describe("login", () => {
  it("returns access and refresh tokens for valid credentials", async () => {
    const response = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: fixture.caregiver.email, password: fixture.password });
    expect(response.status).toBe(200);
    expect(response.body.data.tokens.refreshToken).toBeTruthy();
    expect(response.body.data.tokens.expiresIn).toBeGreaterThan(0);
  });

  it("rejects a wrong password", async () => {
    const response = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: fixture.caregiver.email, password: "WrongPassword#1" });
    expect(response.status).toBe(401);
  });

  it("gives the same message for an unknown email as for a wrong password", async () => {
    const unknown = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: "nobody@test.local", password: "Whatever#1" });
    const wrong = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: fixture.caregiver.email, password: "Whatever#1" });
    // No account enumeration.
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });
});

describe("token handling", () => {
  it("rejects a request with no token", async () => {
    const response = await request(app).get(`${api}/patients/${fixture.patient.id}`);
    expect(response.status).toBe(401);
  });

  it("rejects a malformed token", async () => {
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", "Bearer not.a.real.token");
    expect(response.status).toBe(401);
  });

  it("rotates the refresh token and revokes the presented one", async () => {
    const login = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: fixture.caregiver.email, password: fixture.password });
    const first = login.body.data.tokens.refreshToken;

    const refreshed = await request(app).post(`${api}/auth/refresh`).send({ refreshToken: first });
    expect(refreshed.status).toBe(200);
    const second = refreshed.body.data.tokens.refreshToken;
    expect(second).not.toBe(first);

    // Replaying the old token must fail.
    const replay = await request(app).post(`${api}/auth/refresh`).send({ refreshToken: first });
    expect(replay.status).toBe(401);
  });

  it("revokes every session when a revoked refresh token is replayed", async () => {
    const login = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: fixture.caregiver.email, password: fixture.password });
    const first = login.body.data.tokens.refreshToken;
    const refreshed = await request(app).post(`${api}/auth/refresh`).send({ refreshToken: first });
    const second = refreshed.body.data.tokens.refreshToken;

    // Replaying `first` should burn the whole family, including `second`.
    await request(app).post(`${api}/auth/refresh`).send({ refreshToken: first });
    const afterBreach = await request(app).post(`${api}/auth/refresh`).send({ refreshToken: second });
    expect(afterBreach.status).toBe(401);
  });

  it("revokes the session on logout", async () => {
    const login = await request(app)
      .post(`${api}/auth/login`)
      .send({ email: fixture.caregiver.email, password: fixture.password });
    const { accessToken, refreshToken } = login.body.data.tokens;

    const logout = await request(app)
      .post(`${api}/auth/logout`)
      .set("authorization", `Bearer ${accessToken}`)
      .send({ refreshToken });
    expect(logout.status).toBe(200);

    const afterLogout = await request(app).post(`${api}/auth/refresh`).send({ refreshToken });
    expect(afterLogout.status).toBe(401);
  });

  it("keeps medical data out of the access token", async () => {
    const token = await loginAs(fixture.caregiver.email);
    const [, payloadPart] = token.split(".");
    const claims = JSON.parse(Buffer.from(payloadPart, "base64").toString("utf8"));
    expect(Object.keys(claims).sort()).toEqual(["aud", "exp", "iat", "iss", "role", "sub", "type"]);
    const serialised = JSON.stringify(claims).toLowerCase();
    for (const forbidden of ["medicine", "schedule", "diagnosis", "memory", "patient"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});

describe("device pairing", () => {
  it("pairs a device with the six-digit demo code", async () => {
    const response = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "device-a", platform: "android" });
    expect(response.status).toBe(201);
    expect(response.body.data.patient.preferredName).toBe("Aita");
    expect(response.body.data.deviceToken).toBeTruthy();
  });

  it("rejects a code that is not six digits", async () => {
    const response = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "12ab", deviceIdentifier: "device-b" });
    expect(response.status).toBe(422);
  });

  it("rejects an unknown code", async () => {
    const response = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "000111", deviceIdentifier: "device-c" });
    expect(response.status).toBe(404);
  });

  it("rejects an expired code with a friendly 410", async () => {
    const response = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "999999", deviceIdentifier: "device-d" });
    expect(response.status).toBe(410);
    expect(response.body.error.message).toMatch(/expired/i);
  });

  it("refuses to reuse a code on a second, different device", async () => {
    await request(app).post(`${api}/devices/pair`).send({ pairingCode: "123456", deviceIdentifier: "device-e" });
    const second = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "device-f" });
    expect(second.status).toBe(409);
  });

  it("allows the same physical device to pair again after a reinstall", async () => {
    const first = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "device-g" });
    const second = await request(app)
      .post(`${api}/devices/pair`)
      .send({ pairingCode: "123456", deviceIdentifier: "device-g" });
    expect(second.status).toBe(201);
    // The token is rotated, so the old one must stop working.
    expect(second.body.data.deviceToken).not.toBe(first.body.data.deviceToken);
    const withOldToken = await request(app)
      .get(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", `Bearer ${first.body.data.deviceToken}`);
    expect(withOldToken.status).toBe(401);
  });

  it("stops accepting a device token once the device is revoked", async () => {
    const { deviceToken, deviceId } = await pairDevice();
    await prisma.device.update({ where: { id: deviceId }, data: { revokedAt: new Date() } });
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}`)
      .set("authorization", `Bearer ${deviceToken}`);
    expect(response.status).toBe(401);
  });

  it("does not accept a device token where a user token is required", async () => {
    const { deviceToken } = await pairDevice();
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/schedules`)
      .set("authorization", `Bearer ${deviceToken}`)
      .send({ kind: "MEAL", titleEn: "Lunch", occurrences: [{ timeOfDay: "13:00", daysOfWeek: [] }] });
    expect(response.status).toBe(401);
  });
});
