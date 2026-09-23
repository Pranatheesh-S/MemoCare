import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { api, app, loginAs, pairDevice, resetDatabase, seedFixture, type Fixture } from "./helpers";
import { prisma } from "../lib/prisma";
import { buildSignedUrl, verifyMediaSignature } from "../lib/signedUrl";

let fixture: Fixture;
let token: string;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  token = await loginAs(fixture.caregiver.email);
});

describe("consent linkage", () => {
  it("refuses to create a memory without a consent record for that patient", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/memories`)
      .set("authorization", `Bearer ${token}`)
      .send({
        category: "MY_FAMILY",
        assetType: "PHOTO",
        titleEn: "No consent",
        consentId: "00000000-0000-4000-8000-000000000000",
      });
    expect(response.status).toBe(400);
  });

  it("refuses to attach a new memory to a withdrawn consent", async () => {
    await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({ note: "Family asked" });

    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/memories`)
      .set("authorization", `Bearer ${token}`)
      .send({
        category: "MY_FAMILY",
        assetType: "PHOTO",
        titleEn: "After withdrawal",
        consentId: fixture.consent.id,
      });
    expect(response.status).toBe(409);
  });
});

describe("consent withdrawal", () => {
  it("soft-deletes every asset in scope but keeps the consent record for audit", async () => {
    const response = await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({ note: "Family asked to remove the photographs" });

    expect(response.status).toBe(200);
    expect(response.body.data.assetsRemoved).toBe(1);

    const consent = await prisma.consentRecord.findUnique({ where: { id: fixture.consent.id } });
    expect(consent).not.toBeNull();
    expect(consent?.status).toBe("WITHDRAWN");
    expect(consent?.withdrawnAt).toBeTruthy();
    expect(consent?.withdrawalNote).toMatch(/Family asked/);

    const memory = await prisma.memoryAsset.findUnique({ where: { id: fixture.memory.id } });
    expect(memory?.deletedAt).not.toBeNull();
  });

  it("removes withdrawn assets from the memories list", async () => {
    const before = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/memories`)
      .set("authorization", `Bearer ${token}`);
    expect(before.body.data).toHaveLength(1);

    await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({});

    const after = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/memories`)
      .set("authorization", `Bearer ${token}`);
    expect(after.body.data).toHaveLength(0);
  });

  it("removes withdrawn assets from every future offline package", async () => {
    await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({});

    const device = await pairDevice();
    const pkg = await request(app)
      .get(`${api}/patients/${device.patientId}/offline-package`)
      .set("authorization", `Bearer ${device.deviceToken}`);
    expect(pkg.body.data.memories).toHaveLength(0);
  });

  it("bumps the package version so devices know to refresh", async () => {
    const before = await prisma.patientProfile.findUnique({ where: { id: fixture.patient.id } });
    await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    const after = await prisma.patientProfile.findUnique({ where: { id: fixture.patient.id } });
    expect(after!.packageVersion).toBeGreaterThan(before!.packageVersion);
  });

  it("is idempotent", async () => {
    await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    const second = await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${token}`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.data.alreadyWithdrawn).toBe(true);
  });

  it("blocks an unassigned caregiver from withdrawing consent", async () => {
    const otherToken = await loginAs(fixture.otherCaregiver.email);
    const response = await request(app)
      .post(`${api}/consents/${fixture.consent.id}/withdraw`)
      .set("authorization", `Bearer ${otherToken}`)
      .send({});
    expect(response.status).toBe(403);
  });
});

describe("signed media URLs", () => {
  it("never returns a bare storage path", async () => {
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/memories`)
      .set("authorization", `Bearer ${token}`);
    const [memory] = response.body.data;
    expect(memory.mediaUrl).toContain("signature=");
    expect(memory.mediaUrl).toContain("expires=");
  });

  it("accepts a valid signature", () => {
    const url = buildSignedUrl("seed/daughter.png", fixture.patient.id, "");
    const query = new URLSearchParams(url.split("?")[1]);
    const check = verifyMediaSignature(
      "seed/daughter.png",
      query.get("patientId")!,
      Number(query.get("expires")),
      query.get("signature")!,
    );
    expect(check.valid).toBe(true);
  });

  it("rejects a signature reused for a different patient", () => {
    const url = buildSignedUrl("seed/daughter.png", fixture.patient.id, "");
    const query = new URLSearchParams(url.split("?")[1]);
    const check = verifyMediaSignature(
      "seed/daughter.png",
      fixture.unassignedPatient.id,
      Number(query.get("expires")),
      query.get("signature")!,
    );
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("BAD_SIGNATURE");
  });

  it("rejects a signature reused for a different key", () => {
    const url = buildSignedUrl("seed/daughter.png", fixture.patient.id, "");
    const query = new URLSearchParams(url.split("?")[1]);
    const check = verifyMediaSignature(
      "seed/son.png",
      fixture.patient.id,
      Number(query.get("expires")),
      query.get("signature")!,
    );
    expect(check.valid).toBe(false);
  });

  it("rejects an expired signature", () => {
    const url = buildSignedUrl("seed/daughter.png", fixture.patient.id, "", -10);
    const query = new URLSearchParams(url.split("?")[1]);
    const check = verifyMediaSignature(
      "seed/daughter.png",
      fixture.patient.id,
      Number(query.get("expires")),
      query.get("signature")!,
    );
    expect(check.valid).toBe(false);
    expect(check.reason).toBe("EXPIRED");
  });

  it("returns 403 for a tampered media request", async () => {
    const response = await request(app)
      .get(`${api}/media/${encodeURIComponent("seed/daughter.png")}`)
      .query({ patientId: fixture.patient.id, expires: 9999999999, signature: "deadbeef" });
    expect(response.status).toBe(403);
  });

  it("returns 404, not a crash, when the file is missing on disk", async () => {
    const url = buildSignedUrl("seed/does-not-exist.png", fixture.patient.id, "");
    const [pathPart, query] = url.split("?");
    const response = await request(app).get(pathPart).query(query);
    expect(response.status).toBe(404);
  });
});

describe("upload", () => {
  it("issues a short-lived signed upload target", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/memories/upload-url`)
      .set("authorization", `Bearer ${token}`)
      .send({ fileName: "grandson.jpg", mimeType: "image/jpeg", sizeBytes: 120000 });
    expect(response.status).toBe(201);
    expect(response.body.data.uploadUrl).toContain("signature=");
    expect(response.body.data.expiresInSeconds).toBeLessThanOrEqual(900);
    expect(response.body.data.storageKey).toContain(fixture.patient.id);
  });

  it("rejects an unsupported media type", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/memories/upload-url`)
      .set("authorization", `Bearer ${token}`)
      .send({ fileName: "virus.exe", mimeType: "application/x-msdownload", sizeBytes: 100 });
    expect(response.status).toBe(422);
  });

  it("rejects an oversized file", async () => {
    const response = await request(app)
      .post(`${api}/patients/${fixture.patient.id}/memories/upload-url`)
      .set("authorization", `Bearer ${token}`)
      .send({ fileName: "huge.jpg", mimeType: "image/jpeg", sizeBytes: 60 * 1024 * 1024 });
    expect(response.status).toBe(422);
  });
});

describe("deletion", () => {
  it("soft-deletes a memory", async () => {
    const response = await request(app)
      .delete(`${api}/memories/${fixture.memory.id}`)
      .set("authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    const row = await prisma.memoryAsset.findUnique({ where: { id: fixture.memory.id } });
    expect(row?.deletedAt).not.toBeNull();
  });

  it("blocks an unassigned caregiver from deleting a memory", async () => {
    const otherToken = await loginAs(fixture.otherCaregiver.email);
    const response = await request(app)
      .delete(`${api}/memories/${fixture.memory.id}`)
      .set("authorization", `Bearer ${otherToken}`);
    expect(response.status).toBe(403);
  });
});
