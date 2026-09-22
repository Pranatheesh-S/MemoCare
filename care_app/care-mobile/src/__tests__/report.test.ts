import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildReport, gameLabel, mockSessions, reportTips, type ReportSession } from "../report";

const NOW = new Date("2026-08-20T12:00:00.000Z"); // 17:30 IST

function session(overrides: Partial<ReportSession> & { hoursAgo?: number } = {}): ReportSession {
  const { hoursAgo = 1, ...rest } = overrides;
  return {
    gameType: "MEMORY_MATCH",
    difficulty: 2,
    accuracy: 0.8,
    responseTimeSeconds: 9,
    hintsUsed: 1,
    attempts: 8,
    completed: true,
    abandoned: false,
    engagementDurationSeconds: 180,
    playedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
    ...rest,
  };
}

describe("buildReport — empty", () => {
  it("returns zeros and a plain message with no sessions", () => {
    const r = buildReport([], "week", NOW);
    assert.equal(r.sessionCount, 0);
    assert.equal(r.activeDays, 0);
    assert.equal(r.completionRate, null);
    assert.equal(r.volumeByDay.length, 7);
    assert.match(r.summary, /No activities were recorded this week/);
  });
});

describe("buildReport — window", () => {
  it("weekly keeps only the last 7 days, monthly the last 30", () => {
    const sessions = [session({ hoursAgo: 2 }), session({ hoursAgo: 24 * 6 }), session({ hoursAgo: 24 * 20 })];
    assert.equal(buildReport(sessions, "week", NOW).sessionCount, 2);
    assert.equal(buildReport(sessions, "month", NOW).sessionCount, 3);
    assert.equal(buildReport(sessions, "month", NOW).volumeByDay.length, 30);
  });
});

describe("buildReport — aggregates", () => {
  const sessions: ReportSession[] = [
    session({ hoursAgo: 1, accuracy: 0.9, engagementDurationSeconds: 300, hintsUsed: 0, responseTimeSeconds: 8 }),
    session({ hoursAgo: 2, accuracy: 0.7, engagementDurationSeconds: 120, hintsUsed: 2, responseTimeSeconds: 12 }),
    session({ hoursAgo: 25, gameType: "WHO_IS_THIS", accuracy: 0.5, completed: false, abandoned: true, hintsUsed: 3 }),
    session({ hoursAgo: 26, gameType: "MEMORY_LANE", accuracy: null, engagementDurationSeconds: 240 }),
  ];

  it("counts sessions, active days and minutes; excludes Memory Lane from accuracy", () => {
    const r = buildReport(sessions, "week", NOW);
    assert.equal(r.sessionCount, 4);
    assert.equal(r.scoredSessionCount, 3); // MEMORY_LANE + null excluded... actually 3 scored (0.9,0.7,0.5)
    assert.equal(r.activeDays, 2);
    assert.equal(r.minutesPlayed, 14); // (300+120+180+240)/60
    assert.equal(r.accuracyMedian, 0.7);
  });

  it("completion rate ignores the un-scored calm activity, abandon rate does not", () => {
    const r = buildReport(sessions, "week", NOW);
    // completable = 3 non-calm; 2 completed -> 2/3
    assert.ok(Math.abs((r.completionRate ?? 0) - 2 / 3) < 1e-9);
    assert.ok(Math.abs((r.abandonRate ?? 0) - 1 / 4) < 1e-9);
  });

  it("per-game breakdown is sorted by volume and carries accuracy + max difficulty", () => {
    const r = buildReport(sessions, "week", NOW);
    assert.equal(r.byGame[0].gameType, "MEMORY_MATCH");
    assert.equal(r.byGame[0].sessions, 2);
    assert.equal(r.byGame[0].maxDifficulty, 2);
    const who = r.byGame.find((g) => g.gameType === "WHO_IS_THIS");
    assert.equal(who?.maxDifficulty, 0); // abandoned -> not counted
  });

  it("time-of-day buckets and a best time once a bucket has >= 3 scored sessions", () => {
    // 6 morning (IST 08:30) at 0.9, 2 evening at 0.4
    const at = (utcHour: number, accuracy: number): ReportSession => ({
      ...session(),
      accuracy,
      playedAt: new Date(Date.UTC(2026, 7, 19, utcHour, 0, 0)).toISOString(),
    });
    const r = buildReport(
      [at(3, 0.9), at(3, 0.9), at(3, 0.9), at(3, 0.9), at(14, 0.4), at(14, 0.4)],
      "week",
      NOW,
    );
    const morning = r.byTimeOfDay.find((b) => b.bucket === "Morning");
    assert.equal(morning?.sessions, 4);
    assert.equal(r.bestTimeOfDay, "Morning");
  });
});

describe("buildReport — trend & summary", () => {
  it("marks accuracy as improving when the second half is higher", () => {
    const rising = [0.4, 0.45, 0.5, 0.8, 0.85, 0.9].map((a, i) => session({ hoursAgo: 60 - i * 4, accuracy: a }));
    const r = buildReport(rising, "month", NOW);
    assert.equal(r.accuracyTrend, "up");
    assert.match(r.summary, /improving/);
    assert.match(r.summary, /not a diagnosis/);
  });
});

describe("mockSessions — demo fallback", () => {
  it("is deterministic and produces a full, believable report for each period", () => {
    for (const period of ["week", "month"] as const) {
      const a = mockSessions(period, NOW);
      const b = mockSessions(period, NOW);
      assert.deepEqual(a, b); // stable per period
      const r = buildReport(a, period, NOW);
      assert.ok(r.sessionCount >= 8, `${period}: ${r.sessionCount} sessions`);
      assert.ok(r.activeDays >= 3 && r.activeDays <= r.totalDays);
      assert.ok(r.accuracyMedian !== null && r.accuracyMedian > 0.4 && r.accuracyMedian < 1);
      assert.ok((r.completionRate ?? 0) > 0.5);
      assert.ok(r.byGame.length >= 2);
      assert.doesNotMatch(r.summary, /No activities/);
    }
  });

  it("every session falls inside the requested window", () => {
    const from = NOW.getTime() - 30 * 86_400_000;
    for (const s of mockSessions("month", NOW)) {
      const t = Date.parse(s.playedAt);
      assert.ok(t >= from && t <= NOW.getTime());
    }
  });
});

describe("reportTips", () => {
  it("always returns at least three non-clinical suggestions", () => {
    const r = buildReport(mockSessions("week", NOW), "week", NOW);
    const tips = reportTips(r);
    assert.ok(tips.length >= 3 && tips.length <= 6);
    for (const t of tips) {
      assert.ok(t.title && t.body);
      const text = `${t.title} ${t.body}`.toLowerCase();
      for (const banned of ["diagnos", "dementia", "medicine", "medication", "dose", "prescri"]) {
        assert.ok(!text.includes(banned), `tip mentions "${banned}": ${t.title}`);
      }
    }
  });

  it("flags unfinished sessions and thin activity", () => {
    const sessions = [
      session({ hoursAgo: 1, completed: false, abandoned: true, accuracy: null }),
      session({ hoursAgo: 2, completed: false, abandoned: true, accuracy: null }),
      session({ hoursAgo: 3, accuracy: 0.4 }),
    ];
    const tips = reportTips(buildReport(sessions, "week", NOW));
    const titles = tips.map((t) => t.title.toLowerCase()).join(" | ");
    assert.match(titles, /finishable|every day/);
    assert.ok(tips.some((t) => t.tone === "watch"));
  });

  it("celebrates an improving run and suggests a step up when a game is strong", () => {
    const rising = [0.5, 0.55, 0.6, 0.85, 0.88, 0.9].map((a, i) =>
      session({ hoursAgo: 60 - i * 4, accuracy: a, difficulty: 3, completed: true }),
    );
    const tips = reportTips(buildReport(rising, "month", NOW));
    assert.ok(tips.some((t) => t.tone === "good"));
  });
});

describe("gameLabel", () => {
  it("maps known ids and humanises unknown ones", () => {
    assert.equal(gameLabel("WHO_IS_THIS"), "Who Is This?");
    assert.equal(gameLabel("SOMETHING_NEW"), "something new");
  });
});
