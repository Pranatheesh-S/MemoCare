import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import {
  api,
  app,
  gameSessionPayload,
  loginAs,
  pairDevice,
  resetDatabase,
  seedFixture,
  type Fixture,
} from "./helpers";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { mlClient, type MlSessionPlanResponse } from "../lib/mlClient";

let fixture: Fixture;
let caregiverToken: string;
let device: Awaited<ReturnType<typeof pairDevice>>;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  caregiverToken = await loginAs(fixture.caregiver.email);
  device = await pairDevice();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A plan a well-behaved ML service might return for a struggling patient. */
const GENTLE_PLAN: MlSessionPlanResponse = {
  recommended_game_type: "MEMORY_MATCH",
  difficulty: 1,
  item_count: 4,
  question_count: 2,
  preview_seconds: 11,
  hint_level: 3,
  hint_modality: "BOTH",
  session_length: "SHORT",
  end_with_calm_activity: true,
  content_preference: "FAMILIAR",
  best_time_of_day: "MORNING",
  comfort_first: true,
  reason_code: "GENTLER_SET",
  explanation:
    "Recent activities have been effortful, so the next round has fewer items (4), more time to look and a spoken hint.",
  confidence: 0.7,
  source: "model",
  signals: { fatigue_likely: false, repeated_difficulty: true },
  model_version: "personalisation-rules-1.0.0+personalisation-gemini-1.0.0",
  is_diagnosis: false,
};

function postSession(overrides: Record<string, unknown> = {}) {
  return request(app)
    .post(`${api}/game-sessions`)
    .set("authorization", `Bearer ${device.deviceToken}`)
    .send({
      ...gameSessionPayload(overrides),
      eventId: randomUUID(),
      patientId: device.patientId,
      deviceId: device.deviceId,
    });
}

describe("session plan on game-session submit", () => {
  it("stores and returns the ML plan alongside the adaptation result", async () => {
    const spy = vi.spyOn(mlClient, "buildSessionPlan").mockResolvedValue(GENTLE_PLAN);

    const response = await postSession({ accuracy: 0.3, difficulty: 2 });

    expect(response.status).toBe(201);
    expect(spy).toHaveBeenCalledOnce();
    const plan = response.body.data.sessionPlan;
    expect(plan.source).toBe("model");
    expect(plan.itemCount).toBe(4);
    expect(plan.hintModality).toBe("BOTH");
    expect(plan.endWithCalmActivity).toBe(true);
    expect(plan.isDiagnosis).toBe(false);

    const stored = await prisma.sessionPlan.findUnique({
      where: { patientId_gameType: { patientId: device.patientId, gameType: "MEMORY_MATCH" } },
    });
    expect(stored?.reasonCode).toBe("GENTLER_SET");
  });

  it("re-clamps a plan that tries to jump difficulty or drop hint support", async () => {
    // The fixture seeds MEMORY_MATCH at difficulty 2; raise the hint floor to 3.
    await prisma.difficultyProfile.update({
      where: { patientId_gameType: { patientId: device.patientId, gameType: "MEMORY_MATCH" } },
      data: { hintLevel: 3 },
    });
    vi.spyOn(mlClient, "buildSessionPlan").mockResolvedValue({
      ...GENTLE_PLAN,
      difficulty: 4, // two levels up
      item_count: 999, // out of bounds
      hint_level: 1, // below the stored floor of 3
      source: "model",
    });

    const response = await postSession({ accuracy: 0.9, difficulty: 2 });
    const plan = response.body.data.sessionPlan;

    expect(plan.difficulty).toBeLessThanOrEqual(3); // never more than one step
    expect(plan.itemCount).toBeLessThanOrEqual(12); // MEMORY_MATCH upper bound
    expect(plan.hintLevel).toBeGreaterThanOrEqual(3); // floor kept
  });

  it("falls back to a baseline plan when the ML service is unavailable", async () => {
    vi.spyOn(mlClient, "buildSessionPlan").mockResolvedValue(null);

    const response = await postSession({ accuracy: 0.8, difficulty: 2 });
    const plan = response.body.data.sessionPlan;

    expect(plan.source).toBe("baseline");
    expect(plan.difficulty).toBe(2);
    expect(typeof plan.explanation).toBe("string");
  });
});

describe("GET /patients/:patientId/session-plan", () => {
  it("returns one plan for a given game type and the full set otherwise", async () => {
    vi.spyOn(mlClient, "buildSessionPlan").mockResolvedValue(GENTLE_PLAN);
    await postSession({ accuracy: 0.3, difficulty: 2 });

    const single = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/session-plan?gameType=MEMORY_MATCH`)
      .set("authorization", `Bearer ${caregiverToken}`);
    expect(single.status).toBe(200);
    expect(single.body.data.gameType).toBe("MEMORY_MATCH");
    expect(single.body.data.itemCount).toBe(4);

    const all = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/session-plan`)
      .set("authorization", `Bearer ${caregiverToken}`);
    expect(Array.isArray(all.body.data)).toBe(true);
    expect(all.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it("is refused for a caregiver not assigned to the patient", async () => {
    const otherToken = await loginAs(fixture.otherCaregiver.email);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/session-plan`)
      .set("authorization", `Bearer ${otherToken}`);
    expect(response.status).toBe(403);
  });
});

describe("offline package", () => {
  it("carries the stored session plans", async () => {
    vi.spyOn(mlClient, "buildSessionPlan").mockResolvedValue(GENTLE_PLAN);
    await postSession({ accuracy: 0.3, difficulty: 2 });

    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/offline-package`)
      .set("authorization", `Bearer ${caregiverToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.data.sessionPlans)).toBe(true);
    const plan = response.body.data.sessionPlans.find(
      (p: { gameType: string }) => p.gameType === "MEMORY_MATCH",
    );
    expect(plan.itemCount).toBe(4);
  });
});
