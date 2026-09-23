/**
 * Shared fixtures. Every test file starts from a clean database so ordering
 * between files can never matter.
 */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Express } from "express";
import request from "supertest";
import { prisma } from "../lib/prisma";
import { createApp } from "../app";

export const app: Express = createApp();
export const api = "/api/v1";

export async function resetDatabase(): Promise<void> {
  // TRUNCATE ... CASCADE is far quicker than deleting per table and keeps
  // referential integrity out of the way.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs, alert_dedupe, alerts, observations, visit_notes,
      adaptation_decisions, session_plans, difficulty_profiles, game_sessions, reminder_events,
      sync_events, schedule_versions, schedules, routines, medicines,
      memory_assets, consent_records, family_contacts, pairing_codes, devices,
      health_worker_assignments, caregiver_assignments, patient_profiles,
      refresh_tokens, language_packs, users
    RESTART IDENTITY CASCADE
  `);
}

export type Fixture = Awaited<ReturnType<typeof seedFixture>>;

/**
 * A caregiver assigned to Aita, a health worker assigned to Aita, an admin, and
 * a second patient deliberately NOT assigned to the caregiver so the
 * assignment gate can be proven.
 */
export async function seedFixture() {
  const passwordHash = await bcrypt.hash("Password#2026", 4);

  const [caregiver, otherCaregiver, healthWorker, admin] = await Promise.all([
    prisma.user.create({
      data: { email: "caregiver@test.local", passwordHash, fullName: "Assigned Caregiver", role: "CAREGIVER" },
    }),
    prisma.user.create({
      data: { email: "other@test.local", passwordHash, fullName: "Unassigned Caregiver", role: "CAREGIVER" },
    }),
    prisma.user.create({
      data: { email: "asha@test.local", passwordHash, fullName: "Health Worker", role: "HEALTH_WORKER" },
    }),
    prisma.user.create({
      data: { email: "admin@test.local", passwordHash, fullName: "Admin", role: "ADMIN" },
    }),
  ]);

  const patient = await prisma.patientProfile.create({
    data: {
      displayName: "Aita",
      preferredName: "Aita",
      age: 72,
      location: "Jorhat, Assam",
      preferredLanguage: "as",
      largeText: true,
    },
  });

  const unassignedPatient = await prisma.patientProfile.create({
    data: { displayName: "Koka", preferredName: "Koka", age: 78, location: "Sivasagar, Assam" },
  });

  await prisma.caregiverAssignment.create({
    data: { userId: caregiver.id, patientId: patient.id, relationship: "Daughter", isPrimary: true },
  });
  await prisma.healthWorkerAssignment.create({
    data: { userId: healthWorker.id, patientId: patient.id, facility: "Sub-centre" },
  });
  // The second caregiver is assigned only to the other patient.
  await prisma.caregiverAssignment.create({
    data: { userId: otherCaregiver.id, patientId: unassignedPatient.id },
  });

  const pairingCode = await prisma.pairingCode.create({
    data: {
      code: "123456",
      patientId: patient.id,
      createdById: caregiver.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const expiredCode = await prisma.pairingCode.create({
    data: {
      code: "999999",
      patientId: patient.id,
      createdById: caregiver.id,
      expiresAt: new Date(Date.now() - 60 * 1000),
    },
  });

  const medicine = await prisma.medicine.create({
    data: { patientId: patient.id, name: "Evening tablet", critical: true },
  });

  const schedule = await prisma.schedule.create({
    data: {
      patientId: patient.id,
      medicineId: medicine.id,
      kind: "MEDICINE",
      titleEn: "Evening tablet",
      critical: true,
      occurrences: [{ timeOfDay: "20:00", daysOfWeek: [0, 1, 2, 3, 4, 5, 6] }],
      version: 1,
    },
  });
  await prisma.scheduleVersion.create({
    data: {
      scheduleId: schedule.id,
      version: 1,
      kind: "MEDICINE",
      titleEn: schedule.titleEn,
      critical: true,
      occurrences: schedule.occurrences as object,
      missedAfterMinutes: schedule.missedAfterMinutes,
      snoozeMinutes: schedule.snoozeMinutes,
      active: true,
      changedByUserId: caregiver.id,
    },
  });

  const consent = await prisma.consentRecord.create({
    data: {
      patientId: patient.id,
      purpose: "Family photographs in memory activities",
      grantedByUserId: caregiver.id,
      grantedByName: "Assigned Caregiver",
      assetScope: "Family photographs",
    },
  });

  const memory = await prisma.memoryAsset.create({
    data: {
      patientId: patient.id,
      consentId: consent.id,
      category: "MY_FAMILY",
      assetType: "PHOTO",
      titleEn: "Daughter",
      storageKey: "seed/daughter.png",
      personName: "Nabanita",
      relationshipEn: "Daughter",
    },
  });

  // Mirrors the real seed: Aita has been playing comfortably at level 2.
  await prisma.difficultyProfile.createMany({
    data: (["MEMORY_MATCH", "ROUTINE_BUILDER", "WHO_IS_THIS"] as const).map((gameType) => ({
      patientId: patient.id,
      gameType,
      currentDifficulty: 2,
      hintLevel: 1,
      reasonCode: "SEEDED_BASELINE",
      explanation: "Starting from the level Aita has been playing comfortably.",
    })),
  });
  await prisma.difficultyProfile.create({
    data: {
      patientId: patient.id,
      gameType: "MEMORY_LANE",
      currentDifficulty: 1,
      hintLevel: 1,
      reasonCode: "SEEDED_BASELINE",
      explanation: "Memory Lane is a calm reminiscence activity and is not scored.",
    },
  });

  return {
    caregiver,
    otherCaregiver,
    healthWorker,
    admin,
    patient,
    unassignedPatient,
    pairingCode,
    expiredCode,
    medicine,
    schedule,
    consent,
    memory,
    password: "Password#2026",
  };
}

export async function loginAs(email: string, password = "Password#2026"): Promise<string> {
  const response = await request(app).post(`${api}/auth/login`).send({ email, password });
  if (response.status !== 200) {
    throw new Error(`Login failed for ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.tokens.accessToken;
}

export async function pairDevice(
  pairingCode = "123456",
  deviceIdentifier = `test-device-${randomUUID()}`,
): Promise<{ deviceToken: string; deviceId: string; patientId: string }> {
  const response = await request(app)
    .post(`${api}/devices/pair`)
    .send({ pairingCode, deviceIdentifier, platform: "test" });
  if (response.status !== 201) {
    throw new Error(`Pairing failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return {
    deviceToken: response.body.data.deviceToken,
    deviceId: response.body.data.deviceId,
    patientId: response.body.data.patientId,
  };
}

export function envelope(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date().toISOString();
  return {
    eventId: randomUUID(),
    eventTimestamp: now,
    payloadVersion: 1,
    localCreatedAt: now,
    ...overrides,
  };
}

export function gameSessionPayload(overrides: Record<string, unknown> = {}) {
  return {
    gameType: "MEMORY_MATCH",
    difficulty: 2,
    accuracy: 0.8,
    responseTimeSeconds: 9.5,
    hintsUsed: 1,
    attempts: 8,
    completed: true,
    abandoned: false,
    engagementDurationSeconds: 200,
    playedAt: new Date().toISOString(),
    ...overrides,
  };
}
