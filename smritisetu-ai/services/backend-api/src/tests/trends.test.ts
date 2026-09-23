import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { api, app, loginAs, pairDevice, resetDatabase, seedFixture, type Fixture } from "./helpers";
import { prisma } from "../lib/prisma";
import { mlClient } from "../lib/mlClient";
import { evaluateAdaptation } from "../services/adaptation";

let fixture: Fixture;
let token: string;

beforeEach(async () => {
  await resetDatabase();
  fixture = await seedFixture();
  token = await loginAs(fixture.caregiver.email);
});

afterEach(() => {
  vi.restoreAllMocks();
});

const REVIEW_RESULT = {
  status: "REVIEW_SUGGESTED" as const,
  reason_code: "SUSTAINED_HINT_INCREASE",
  explanation:
    "The patient required more hints in five of the last seven comparable sessions. Caregiver review is suggested.",
  is_diagnosis: false as const,
  indicators: [
    { name: "hints_per_session", current: 2.5, baseline: 0.5, direction: "UP" as const, sample_size: 7 },
    { name: "median_accuracy", current: 0.66, baseline: 0.84, direction: "DOWN" as const, sample_size: 7 },
  ],
  session_count: 7,
  model_version: "trends-rules-1.0.0",
};

describe("trends endpoint", () => {
  it("returns an explainable, non-diagnostic observation", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(REVIEW_RESULT);

    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("REVIEW_SUGGESTED");
    expect(response.body.data.isDiagnosis).toBe(false);
    expect(response.body.data.reasonCode).toBe("SUSTAINED_HINT_INCREASE");
    expect(response.body.data.indicators).toHaveLength(2);
    expect(response.body.data.modelVersion).toBeTruthy();
  });

  it("never uses diagnostic language", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(REVIEW_RESULT);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);
    const text = response.body.data.explanation.toLowerCase();
    for (const banned of ["dementia", "worsened", "high risk", "detected", "medicine must"]) {
      expect(text).not.toContain(banned);
    }
  });

  it("persists the observation and raises a review alert", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(REVIEW_RESULT);
    await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);

    const observation = await prisma.observation.findFirst({ where: { patientId: fixture.patient.id } });
    expect(observation?.status).toBe("REVIEW_SUGGESTED");
    expect(observation?.isDiagnosis).toBe(false);

    const alert = await prisma.alert.findFirst({ where: { type: "SUSTAINED_TREND_CHANGE" } });
    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe("ATTENTION");
    expect(alert?.evidence).toMatchObject({ isDiagnosis: false });
  });

  it("raises no alert when the trend is stable", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue({
      ...REVIEW_RESULT,
      status: "STABLE",
      reason_code: "NO_SUSTAINED_CHANGE",
      explanation: "Participation and results are in line with the previous period.",
    });
    await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);
    expect(await prisma.alert.count({ where: { type: "SUSTAINED_TREND_CHANGE" } })).toBe(0);
  });

  it("does not raise a duplicate alert for the same standing observation", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(REVIEW_RESULT);
    await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);
    await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);
    expect(await prisma.alert.count({ where: { type: "SUSTAINED_TREND_CHANGE" } })).toBe(1);
  });

  it("defaults to the 7-day period and rejects an unsupported one", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(REVIEW_RESULT);
    const defaulted = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends`)
      .set("authorization", `Bearer ${token}`);
    expect(defaulted.body.data.period).toBe("7d");

    const invalid = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=90d`)
      .set("authorization", `Bearer ${token}`);
    expect(invalid.status).toBe(422);
  });
});

describe("ML service unavailable", () => {
  it("reports insufficient data rather than inventing a conclusion", async () => {
    vi.spyOn(mlClient, "analyseTrends").mockResolvedValue(null);
    const response = await request(app)
      .get(`${api}/patients/${fixture.patient.id}/trends?period=7d`)
      .set("authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("INSUFFICIENT_DATA");
    expect(response.body.data.reasonCode).toBe("ANALYSIS_UNAVAILABLE");
    expect(response.body.data.isDiagnosis).toBe(false);
  });

  it("keeps the current difficulty and queues the evaluation", async () => {
    vi.spyOn(mlClient, "recommendDifficulty").mockResolvedValue(null);
    await prisma.difficultyProfile.update({
      where: { patientId_gameType: { patientId: fixture.patient.id, gameType: "MEMORY_MATCH" } },
      data: { currentDifficulty: 3, hintLevel: 2 },
    });

    const result = await evaluateAdaptation(fixture.patient.id, "MEMORY_MATCH");
    expect(result.applied).toBe(false);
    expect(result.difficulty).toBe(3);
    expect(result.reasonCode).toBe("ML_UNAVAILABLE_EVALUATION_QUEUED");

    const profile = await prisma.difficultyProfile.findUnique({
      where: { patientId_gameType: { patientId: fixture.patient.id, gameType: "MEMORY_MATCH" } },
    });
    expect(profile?.currentDifficulty).toBe(3);
  });

  it("does not block a device from playing or syncing", async () => {
    vi.spyOn(mlClient, "recommendDifficulty").mockResolvedValue(null);
    const device = await pairDevice();
    const response = await request(app)
      .get(`${api}/patients/${device.patientId}/game-config`)
      .set("authorization", `Bearer ${device.deviceToken}`);
    expect(response.status).toBe(200);
    expect(response.body.data.games).toHaveLength(4);
  });
});

describe("adaptation safety", () => {
  it("clamps an out-of-range recommendation from the ML service", async () => {
    vi.spyOn(mlClient, "recommendDifficulty").mockResolvedValue({
      recommended_difficulty: 99,
      hint_level: 99,
      recommended_game_type: "MEMORY_MATCH",
      reason_code: "ACCURACY_ABOVE_THRESHOLD",
      explanation: "Doing well.",
      confidence: 0.9,
      evidence_session_count: 3,
      model_version: "test-1.0.0",
    });
    await prisma.difficultyProfile.update({
      where: { patientId_gameType: { patientId: fixture.patient.id, gameType: "MEMORY_MATCH" } },
      data: { currentDifficulty: 1, hintLevel: 1 },
    });

    const result = await evaluateAdaptation(fixture.patient.id, "MEMORY_MATCH");
    // Never more than one level, never past the maximum.
    expect(result.difficulty).toBe(2);

    const profile = await prisma.difficultyProfile.findUnique({
      where: { patientId_gameType: { patientId: fixture.patient.id, gameType: "MEMORY_MATCH" } },
    });
    expect(profile?.hintLevel).toBeLessThanOrEqual(3);
  });

  it("records the evidence, rule version and explanation for every decision", async () => {
    vi.spyOn(mlClient, "recommendDifficulty").mockResolvedValue({
      recommended_difficulty: 3,
      hint_level: 2,
      recommended_game_type: "MEMORY_MATCH",
      reason_code: "ACCURACY_ABOVE_THRESHOLD",
      explanation: "Three comfortable sessions in a row.",
      confidence: 0.85,
      evidence_session_count: 3,
      model_version: "rules-1.0.0",
    });
    await evaluateAdaptation(fixture.patient.id, "MEMORY_MATCH");

    const decision = await prisma.adaptationDecision.findFirst({ where: { patientId: fixture.patient.id } });
    expect(decision).not.toBeNull();
    expect(decision?.previousDifficulty).toBe(2);
    expect(decision?.recommendedDifficulty).toBe(3);
    expect(decision?.modelVersion).toBe("rules-1.0.0");
    expect(decision?.explanation).toBeTruthy();
    expect(decision?.evidence).toBeTruthy();
  });

  it("never changes the difficulty of the unscored Memory Lane activity", async () => {
    const spy = vi.spyOn(mlClient, "recommendDifficulty");
    const result = await evaluateAdaptation(fixture.patient.id, "MEMORY_LANE");
    expect(result.reasonCode).toBe("UNSCORED_ACTIVITY");
    expect(spy).not.toHaveBeenCalled();
  });
});
