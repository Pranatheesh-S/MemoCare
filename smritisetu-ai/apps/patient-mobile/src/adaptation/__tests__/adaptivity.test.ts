import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectAnomaly } from "../anomaly";
import { recommendDifficulty } from "../engine";
import { recommendEngagement, recommendNextLevel } from "../recommend";
import { clampStep, isSafeText } from "../safety";
import { ADAPTATION } from "../thresholds";
import type { AdaptationSession } from "../types";

const NOW = Date.parse("2026-08-25T12:00:00.000Z");

function session(overrides: Partial<AdaptationSession> & { daysAgo?: number } = {}): AdaptationSession {
  const { daysAgo = 0, ...rest } = overrides;
  return {
    gameType: "MEMORY_MATCH",
    difficulty: 2,
    accuracy: 0.8,
    hintsUsed: 0,
    completed: true,
    abandoned: false,
    responseTimeSeconds: 9,
    engagementDurationSeconds: 180,
    playedAt: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    ...rest,
  };
}

function recommend(
  sessions: AdaptationSession[],
  currentDifficulty = 2,
  gameType: AdaptationSession["gameType"] = "MEMORY_MATCH",
) {
  return recommendDifficulty({ gameType, currentDifficulty, sessions });
}

describe("difficulty increase", () => {
  it("three strong sessions increase difficulty by one", () => {
    const sessions = [0, 1, 2].map((daysAgo) => session({ accuracy: 0.86, daysAgo }));
    const result = recommend(sessions, 2);
    assert.equal(result.recommendedDifficulty, 3);
    assert.equal(result.reasonCode, "ACCURACY_ABOVE_THRESHOLD");
    assert.equal(result.evidenceSessionCount, 3);
  });

  it("exactly at the threshold counts as strong", () => {
    const sessions = [0, 1, 2].map((daysAgo) => session({ accuracy: 0.8, difficulty: 1, daysAgo }));
    const result = recommend(sessions, 1);
    assert.equal(result.recommendedDifficulty, 2);
  });

  it("just below the threshold does not increase", () => {
    const sessions = [0, 1, 2].map((daysAgo) => session({ accuracy: 0.799, daysAgo }));
    const result = recommend(sessions, 2);
    assert.equal(result.recommendedDifficulty, 2);
    assert.equal(result.reasonCode, "MAINTAIN_CURRENT_LEVEL");
  });

  it("two strong sessions are not enough", () => {
    const sessions = [0, 1].map((daysAgo) => session({ accuracy: 0.9, daysAgo }));
    const result = recommend(sessions, 2);
    assert.equal(result.recommendedDifficulty, 2);
  });

  it("only same-difficulty sessions are compared", () => {
    const sessions = [0, 1, 2].map((daysAgo) => session({ accuracy: 0.95, difficulty: 1, daysAgo }));
    const result = recommend(sessions, 3);
    assert.equal(result.recommendedDifficulty, 3);
    assert.equal(result.reasonCode, "INSUFFICIENT_EVIDENCE");
  });
});

describe("difficulty decrease", () => {
  it("two low sessions reduce difficulty by one", () => {
    const sessions = [0, 1].map((daysAgo) => session({ accuracy: 0.35, difficulty: 3, daysAgo }));
    const result = recommend(sessions, 3);
    assert.equal(result.recommendedDifficulty, 2);
    assert.equal(result.reasonCode, "ACCURACY_BELOW_THRESHOLD");
  });

  it("exactly at the lower threshold does not decrease", () => {
    const sessions = [0, 1].map((daysAgo) => session({ accuracy: 0.5, difficulty: 3, daysAgo }));
    const result = recommend(sessions, 3);
    assert.equal(result.recommendedDifficulty, 3);
  });

  it("one low session alone changes nothing", () => {
    const sessions = [
      session({ accuracy: 0.2, difficulty: 3, daysAgo: 0 }),
      session({ accuracy: 0.85, difficulty: 3, daysAgo: 1 }),
    ];
    const result = recommend(sessions, 3);
    assert.equal(result.recommendedDifficulty, 3);
  });
});

describe("boundaries", () => {
  it("difficulty never exceeds the maximum", () => {
    const sessions = [0, 1, 2].map((daysAgo) =>
      session({ accuracy: 0.99, difficulty: ADAPTATION.maxDifficulty, daysAgo }),
    );
    const result = recommend(sessions, ADAPTATION.maxDifficulty);
    assert.equal(result.recommendedDifficulty, ADAPTATION.maxDifficulty);
    assert.equal(result.reasonCode, "AT_MAXIMUM_MAINTAINED");
  });

  it("difficulty never falls below the minimum", () => {
    const sessions = [0, 1].map((daysAgo) =>
      session({ accuracy: 0.1, difficulty: ADAPTATION.minDifficulty, daysAgo }),
    );
    const result = recommend(sessions, ADAPTATION.minDifficulty);
    assert.equal(result.recommendedDifficulty, ADAPTATION.minDifficulty);
    assert.equal(result.reasonCode, "AT_MINIMUM_ADDED_SUPPORT");
    assert.equal(result.hintLevel, ADAPTATION.maxHintLevel);
  });

  it("difficulty never moves more than one level even if asked", () => {
    assert.equal(clampStep(1, 4), 2);
    assert.equal(clampStep(4, 1), 3);
  });

  it("out-of-range current difficulty is clamped", () => {
    for (const outOfRange of [-5, 0, 9, 99]) {
      const sessions = [0, 1, 2].map((daysAgo) => session({ accuracy: 0.85, daysAgo }));
      const result = recommend(sessions, outOfRange);
      assert.ok(result.recommendedDifficulty >= ADAPTATION.minDifficulty);
      assert.ok(result.recommendedDifficulty <= ADAPTATION.maxDifficulty);
    }
  });
});

describe("hint support", () => {
  it("repeated hints keep difficulty and raise support", () => {
    const sessions = [0, 1, 2].map((daysAgo) => session({ accuracy: 0.65, hintsUsed: 3, daysAgo }));
    const result = recommend(sessions, 2);
    assert.equal(result.recommendedDifficulty, 2);
    assert.equal(result.reasonCode, "HINT_SUPPORT_INCREASED");
    assert.ok(result.hintLevel >= 2);
  });

  it("hint level never exceeds the maximum", () => {
    const sessions = [0, 1, 2, 3].map((daysAgo) => session({ accuracy: 0.65, hintsUsed: 50, daysAgo }));
    const result = recommend(sessions, 2);
    assert.ok(result.hintLevel <= ADAPTATION.maxHintLevel);
  });
});

describe("abandonment", () => {
  it("two abandoned activities offer a calmer activity", () => {
    const sessions = [
      session({ abandoned: true, completed: false, accuracy: null, daysAgo: 0 }),
      session({ abandoned: true, completed: false, accuracy: null, daysAgo: 1 }),
      session({ accuracy: 0.9, daysAgo: 2 }),
    ];
    const result = recommend(sessions, 3);
    assert.equal(result.reasonCode, "ABANDONMENT_SUPPORT");
    assert.equal(result.recommendedGameType, "MEMORY_LANE");
    assert.equal(result.recommendedDifficulty, 3);
  });

  it("abandonment outranks a strong accuracy run", () => {
    const sessions = [
      session({ abandoned: true, completed: false, accuracy: null, daysAgo: 0 }),
      session({ abandoned: true, completed: false, accuracy: null, daysAgo: 1 }),
      ...[2, 3, 4].map((daysAgo) => session({ accuracy: 0.95, daysAgo })),
    ];
    const result = recommend(sessions, 2);
    assert.equal(result.recommendedDifficulty, 2);
  });
});

describe("insufficient evidence", () => {
  it("no sessions maintains the current level", () => {
    const result = recommend([], 2);
    assert.equal(result.recommendedDifficulty, 2);
    assert.equal(result.reasonCode, "INSUFFICIENT_EVIDENCE");
  });

  it("one unusual session maintains the current level", () => {
    const result = recommend([session({ accuracy: 0.05, difficulty: 3 })], 3);
    assert.equal(result.recommendedDifficulty, 3);
    assert.equal(result.reasonCode, "INSUFFICIENT_EVIDENCE");
  });

  it("sessions with no accuracy are not treated as zero", () => {
    const sessions = [0, 1, 2].map((daysAgo) =>
      session({ accuracy: null, completed: true, difficulty: 3, daysAgo }),
    );
    const result = recommend(sessions, 3);
    assert.equal(result.recommendedDifficulty, 3);
    assert.equal(result.reasonCode, "INSUFFICIENT_EVIDENCE");
  });
});

describe("unscored activity", () => {
  it("Memory Lane difficulty never changes", () => {
    const sessions = [0, 1, 2].map((daysAgo) =>
      session({ gameType: "MEMORY_LANE", accuracy: null, daysAgo }),
    );
    const result = recommend(sessions, 1, "MEMORY_LANE");
    assert.equal(result.reasonCode, "UNSCORED_ACTIVITY");
    assert.equal(result.recommendedDifficulty, 1);
  });
});

describe("non-diagnostic wording", () => {
  it("every explanation is free of clinical language", () => {
    const cases: Array<[AdaptationSession[], number]> = [
      [[0, 1, 2].map((daysAgo) => session({ accuracy: 0.9, daysAgo })), 2],
      [[0, 1].map((daysAgo) => session({ accuracy: 0.2, difficulty: 3, daysAgo })), 3],
      [[0, 1, 2].map((daysAgo) => session({ accuracy: 0.65, hintsUsed: 4, daysAgo })), 2],
      [[0, 1].map((daysAgo) => session({ abandoned: true, completed: false, accuracy: null, daysAgo })), 2],
      [[], 1],
    ];
    for (const [sessions, current] of cases) {
      const result = recommend(sessions, current);
      assert.equal(result.isDiagnosis, false);
      assert.ok(isSafeText(result.explanation), result.explanation);
    }
  });

  it("explanations never say wrong or failed", () => {
    const sessions = [0, 1].map((daysAgo) => session({ accuracy: 0.1, difficulty: 3, daysAgo }));
    const result = recommend(sessions, 3);
    const lowered = result.explanation.toLowerCase();
    for (const banned of ["wrong", "failed", "poor", "game over"]) {
      assert.equal(lowered.includes(banned), false);
    }
  });
});

describe("anomaly hold", () => {
  it("withholds an increase when the newest session looks unlike the baseline", () => {
    const baseline = Array.from({ length: 14 }, (_, index) =>
      session({
        accuracy: 0.85,
        hintsUsed: 0,
        responseTimeSeconds: 9,
        engagementDurationSeconds: 180,
        daysAgo: index + 1,
      }),
    );
    const unusual = session({
      accuracy: 0.95,
      hintsUsed: 8,
      responseTimeSeconds: 80,
      engagementDurationSeconds: 20,
      daysAgo: 0,
    });
    const sessions = [unusual, ...baseline];
    const rulesOnly = recommend(sessions, 2);
    assert.equal(rulesOnly.recommendedDifficulty, 3);

    const signal = detectAnomaly(sessions);
    assert.equal(signal.available, true);
    assert.equal(signal.isUnusual, true);

    const held = recommendNextLevel({ gameType: "MEMORY_MATCH", currentDifficulty: 2, sessions });
    assert.equal(held.recommendedDifficulty, 2);
    assert.equal(held.reasonCode, "HOLD_UNUSUAL_RECENT_SESSION");
  });
});

describe("engagement", () => {
  it("starts with a gentle matching activity when there is no history", () => {
    const result = recommendEngagement([]);
    assert.equal(result.recommendedGameType, "MEMORY_MATCH");
    assert.equal(result.reasonCode, "NO_HISTORY");
  });

  it("offers Memory Lane after repeated abandonment", () => {
    const sessions = [
      session({ abandoned: true, completed: false, accuracy: null, daysAgo: 0 }),
      session({ abandoned: true, completed: false, accuracy: null, daysAgo: 1 }),
    ];
    const result = recommendEngagement(sessions);
    assert.equal(result.recommendedGameType, "MEMORY_LANE");
    assert.equal(result.reasonCode, "RECENT_ABANDONMENT");
  });
});
