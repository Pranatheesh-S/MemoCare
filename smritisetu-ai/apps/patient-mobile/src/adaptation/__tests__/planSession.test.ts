import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GameType } from "@smritisetu/shared-types";
import { planSession } from "../planSession";
import { deriveSignals } from "../signals";
import { isSafeText } from "../safety";
import type { AdaptationSession } from "../types";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function session(overrides: Partial<AdaptationSession> & { hoursAgo?: number } = {}): AdaptationSession {
  const { hoursAgo = 24, ...rest } = overrides;
  return {
    gameType: "MEMORY_MATCH",
    difficulty: 2,
    accuracy: 0.8,
    hintsUsed: 0,
    completed: true,
    abandoned: false,
    responseTimeSeconds: 9,
    engagementDurationSeconds: 180,
    playedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString(),
    ...rest,
  };
}

function plan(sessions: AdaptationSession[], currentDifficulty = 2, gameType: GameType = "MEMORY_MATCH") {
  return planSession({ patientId: "p1", gameType, currentDifficulty, sessions, now: NOW });
}

describe("on-device session planner", () => {
  it("keeps the current level with a limited history", () => {
    const result = plan([]);
    assert.equal(result.source, "baseline");
    assert.equal(result.difficulty, 2);
    assert.equal(result.reasonCode, "LIMITED_HISTORY");
    assert.equal(result.isDiagnosis, false);
    assert.ok(isSafeText(result.explanation));
  });

  it("steps up one level after a smooth run", () => {
    const sessions = [0, 24, 48, 72, 96].map((h) => session({ accuracy: 0.9, hoursAgo: h }));
    const result = plan(sessions, 2);
    assert.equal(result.difficulty, 3);
    assert.equal(result.reasonCode, "STEP_UP_READY");
    assert.equal(result.comfortFirst, false);
  });

  it("turns an eight-card struggle into a four-card round", () => {
    const sessions = [0, 24, 48, 72].map((h) => session({ accuracy: 0.3, difficulty: 3, hoursAgo: h }));
    const result = plan(sessions, 3);
    assert.equal(result.difficulty, 2); // one gentle step, never two
    assert.equal(result.itemCount, 4); // the MEMORY_MATCH lower bound
    assert.ok(result.previewSeconds >= 8);
    assert.equal(result.hintModality, "BOTH");
    assert.equal(result.contentPreference, "FAMILIAR");
    assert.equal(result.endWithCalmActivity, true);
    assert.equal(result.comfortFirst, true);
    assert.ok(isSafeText(result.explanation));
  });

  it("never raises difficulty while fatigue is likely", () => {
    const sessions = [0.5, 2, 4, 6].map((h) => session({ accuracy: 0.92, hoursAgo: h }));
    const result = plan(sessions, 2);
    assert.equal(result.difficulty, 2);
    assert.equal(result.sessionLength, "SHORT");
    assert.equal(result.comfortFirst, true);
    assert.equal(result.reasonCode, "SHORTENED_FOR_FATIGUE");
  });

  it("leaves Memory Lane gentle and unscored", () => {
    const result = plan(
      [0, 24, 48].map((h) => session({ gameType: "MEMORY_LANE", accuracy: null, hoursAgo: h })),
      3,
      "MEMORY_LANE",
    );
    assert.equal(result.gameType, "MEMORY_LANE");
    assert.equal(result.difficulty, 3);
    assert.equal(result.reasonCode, "UNSCORED_CALM_ACTIVITY");
    assert.equal(result.itemCount, 0);
  });
});

describe("signal derivation", () => {
  it("reports the time of day with the best median accuracy", () => {
    const at = (utcHour: number, accuracy: number): AdaptationSession => ({
      ...session(),
      accuracy,
      playedAt: new Date(Date.UTC(2026, 7, 20, utcHour, 0, 0)).toISOString(),
    });
    // UTC+5:30: 03:00 -> 08:30 MORNING, 09:00 -> 14:30 AFTERNOON.
    const signals = deriveSignals(
      [at(3, 0.9), at(3, 0.9), at(3, 0.9), at(9, 0.4), at(9, 0.4), at(9, 0.4)],
      NOW,
    );
    assert.equal(signals.bestTimeOfDay, "MORNING");
  });

  it("flags repeated difficulty and familiar content after low rounds", () => {
    const signals = deriveSignals(
      [0, 24, 48, 72].map((h) => session({ accuracy: 0.3, hoursAgo: h })),
      NOW,
    );
    assert.equal(signals.repeatedDifficulty, true);
    assert.equal(signals.familiarContentRecommended, true);
  });
});
