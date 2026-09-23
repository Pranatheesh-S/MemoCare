import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AdaptationEngine,
  buildFeatureVector,
  itemCountToDifficulty,
  mapParamsToDecision,
  previewSecondsFromParams,
  ruleBasedFallback,
  toSessionStats,
} from "../AdaptationEngine";
import { isSafeText } from "../safety";
import type { AdaptationSession } from "../types";

function stat(overrides: Partial<Parameters<typeof buildFeatureVector>[0][number]> = {}) {
  return {
    accuracy: 0.8,
    responseTimeMs: 4000,
    hintsUsed: 0,
    maxHints: 3,
    completed: true,
    ...overrides,
  };
}

describe("feature vector", () => {
  it("averages the last five sessions and scores an improving trend", () => {
    const features = buildFeatureVector([
      stat({ accuracy: 0.4 }),
      stat({ accuracy: 0.5 }),
      stat({ accuracy: 0.9, responseTimeMs: 2000, hintsUsed: 0 }),
    ]);
    const [avgAccuracy, avgResponseTimeNorm, avgHintsNorm, completionRate, recentTrend] = features;
    assert.ok(Math.abs(avgAccuracy - 0.6) < 1e-9);
    assert.ok(avgResponseTimeNorm < 0.3);
    assert.equal(avgHintsNorm, 0);
    assert.equal(completionRate, 1);
    assert.ok(recentTrend > 0.3);
  });

  it("treats a missing prior window as a flat trend", () => {
    const features = buildFeatureVector([stat({ accuracy: 0.7 })]);
    assert.equal(features[4], 0);
  });
});

describe("teacher fallback", () => {
  it("raises item count and lowers time and hints when performance is strong", () => {
    const strong = ruleBasedFallback([0.9, 0.2, 0.1, 1, 0.3]);
    const struggling = ruleBasedFallback([0.3, 0.8, 0.9, 0.5, -0.4]);
    assert.ok(strong.itemCount > struggling.itemCount);
    assert.ok(strong.timeGivenSec < struggling.timeGivenSec);
    assert.ok(strong.hintFrequency < struggling.hintFrequency);
  });

  it("starts gently when there is no history", async () => {
    const engine = new AdaptationEngine();
    const params = await engine.getNextDifficulty([]);
    assert.equal(engine.lastSource, "default");
    assert.deepEqual(params, { itemCount: 3, timeGivenSec: 25, hintFrequency: 0.6 });
  });

  it("uses the teacher when the TFLite model has not loaded", async () => {
    const engine = new AdaptationEngine();
    const params = await engine.getNextDifficulty([
      stat({ accuracy: 0.95, responseTimeMs: 1500, hintsUsed: 0 }),
    ]);
    assert.equal(engine.lastSource, "fallback");
    assert.ok(params.itemCount >= 4);
    assert.ok(params.timeGivenSec <= 20);
  });
});

describe("parameter mapping", () => {
  it("maps item counts onto the existing 1-4 difficulty band", () => {
    assert.equal(itemCountToDifficulty(2), 1);
    assert.equal(itemCountToDifficulty(3), 2);
    assert.equal(itemCountToDifficulty(4), 3);
    assert.equal(itemCountToDifficulty(5), 4);
    assert.equal(itemCountToDifficulty(6), 4);
  });

  it("never jumps more than one level from the current difficulty", () => {
    const jump = mapParamsToDecision({
      params: { itemCount: 6, timeGivenSec: 10, hintFrequency: 0 },
      source: "model",
      currentDifficulty: 2,
      gameType: "MEMORY_MATCH",
      evidenceSessionCount: 3,
    });
    assert.equal(jump.recommendedDifficulty, 3);
    assert.equal(jump.reasonCode, "TFLITE_INCREASE");
    assert.ok(isSafeText(jump.explanation));
  });

  it("gives more preview time when the model asks for a slower round", () => {
    const slow = previewSecondsFromParams({ itemCount: 2, timeGivenSec: 40, hintFrequency: 1 }, 1);
    const quick = previewSecondsFromParams({ itemCount: 6, timeGivenSec: 10, hintFrequency: 0 }, 4);
    assert.ok(slow > quick);
    assert.equal(slow, 8);
    assert.equal(quick, 4);
  });
});

describe("session conversion", () => {
  it("uses the activity's hint budget as maxHints", () => {
    const sessions: AdaptationSession[] = [
      {
        gameType: "MEMORY_MATCH",
        difficulty: 4,
        accuracy: 0.5,
        hintsUsed: 1,
        completed: true,
        abandoned: false,
        responseTimeSeconds: 12,
        engagementDurationSeconds: 90,
        playedAt: "2026-08-26T10:00:00.000Z",
      },
    ];
    const [converted] = toSessionStats(sessions);
    assert.equal(converted?.maxHints, 1);
    assert.equal(converted?.responseTimeMs, 12000);
    assert.equal(converted?.completed, true);
  });
});
