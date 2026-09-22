/**
 * Turns a list of the patient's game sessions (from Firestore) into a weekly or
 * monthly report. Pure — no Firebase, no React — so every number is unit-tested.
 *
 * "Every aspect" the patient app actually produces: how much they play, how
 * accurately, how quickly, how much help they need, how long they stay engaged,
 * which activities, and what time of day suits them best.
 */

export type ReportSession = {
  gameType: string;
  difficulty: number;
  accuracy: number | null; // 0..1
  responseTimeSeconds: number;
  hintsUsed: number;
  attempts: number;
  completed: boolean;
  abandoned: boolean;
  engagementDurationSeconds: number;
  playedAt: string; // ISO, UTC
};

export type Period = "week" | "month";

// The North-East India deployment is UTC+5:30.
const UTC_OFFSET_MIN = 330;
const CALM_GAME = "MEMORY_LANE";

const GAME_LABEL: Record<string, string> = {
  MEMORY_MATCH: "Memory Match",
  MARKET_MEMORY: "Market Memory",
  WHO_IS_THIS: "Who Is This?",
  ROUTINE_BUILDER: "My Routine",
  MEMORY_LANE: "Memory Lane",
};

export function gameLabel(gameType: string): string {
  return GAME_LABEL[gameType] ?? gameType.replace(/_/g, " ").toLowerCase();
}

function localDate(iso: string): Date {
  return new Date(new Date(iso).getTime() + UTC_OFFSET_MIN * 60_000);
}
function dayKey(iso: string): string {
  return localDate(iso).toISOString().slice(0, 10);
}
function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

export type DayPoint = { date: string; label: string; value: number };

export type PatientReport = {
  period: Period;
  fromISO: string;
  toISO: string;
  sessionCount: number;
  scoredSessionCount: number;
  activeDays: number;
  totalDays: number;
  minutesPlayed: number;
  completionRate: number | null; // 0..1 over completable (non-calm) sessions
  abandonRate: number | null;
  accuracyMedian: number | null; // 0..1
  accuracyTrend: "up" | "down" | "steady" | "unknown";
  responseSecondsMedian: number | null;
  hintsPerSession: number | null;
  volumeByDay: DayPoint[]; // sessions per day
  minutesByDay: DayPoint[];
  accuracyByDay: DayPoint[]; // median %, 0..100, only days with scored play
  responseByDay: DayPoint[]; // median seconds
  hintsByDay: DayPoint[]; // avg hints
  byGame: { gameType: string; label: string; sessions: number; accuracy: number | null; maxDifficulty: number }[];
  byTimeOfDay: { bucket: "Morning" | "Afternoon" | "Evening" | "Night"; sessions: number; accuracy: number | null }[];
  bestTimeOfDay: "Morning" | "Afternoon" | "Evening" | "Night" | null;
  summary: string;
};

function bucketOf(iso: string): PatientReport["byTimeOfDay"][number]["bucket"] {
  const h = localDate(iso).getUTCHours();
  if (h >= 5 && h < 12) return "Morning";
  if (h >= 12 && h < 17) return "Afternoon";
  if (h >= 17 && h < 22) return "Evening";
  return "Night";
}

function eachDay(from: Date, to: Date): string[] {
  const days: string[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (d <= end) {
    days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

export function buildReport(
  allSessions: ReportSession[],
  period: Period,
  now: Date = new Date(),
): PatientReport {
  const days = period === "week" ? 7 : 30;
  const nowLocal = localDate(now.toISOString());
  const from = new Date(nowLocal);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const fromISO = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()) - UTC_OFFSET_MIN * 60_000,
  ).toISOString();
  const toISO = now.toISOString();

  const sessions = allSessions
    .filter((s) => {
      const t = Date.parse(s.playedAt);
      return t >= Date.parse(fromISO) && t <= now.getTime();
    })
    .sort((a, b) => Date.parse(a.playedAt) - Date.parse(b.playedAt));

  const scored = sessions.filter((s) => s.gameType !== CALM_GAME && s.accuracy !== null);
  const completable = sessions.filter((s) => s.gameType !== CALM_GAME);

  const dayList = eachDay(from, nowLocal);
  const labelFor = (dk: string) => {
    const d = new Date(dk + "T00:00:00Z");
    return period === "week"
      ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]
      : `${d.getUTCDate()}`;
  };

  const byDay = new Map<string, ReportSession[]>();
  for (const s of sessions) {
    const k = dayKey(s.playedAt);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }

  const volumeByDay: DayPoint[] = dayList.map((dk) => ({ date: dk, label: labelFor(dk), value: byDay.get(dk)?.length ?? 0 }));
  const minutesByDay: DayPoint[] = dayList.map((dk) => ({
    date: dk,
    label: labelFor(dk),
    value: round((byDay.get(dk) ?? []).reduce((m, s) => m + s.engagementDurationSeconds, 0) / 60, 1),
  }));
  const accuracyByDay: DayPoint[] = dayList.map((dk) => {
    const accs = (byDay.get(dk) ?? [])
      .filter((s) => s.gameType !== CALM_GAME && s.accuracy !== null)
      .map((s) => s.accuracy as number);
    const m = median(accs);
    return { date: dk, label: labelFor(dk), value: m === null ? -1 : round(m * 100) };
  });
  const responseByDay: DayPoint[] = dayList.map((dk) => {
    const rts = (byDay.get(dk) ?? []).filter((s) => s.responseTimeSeconds > 0).map((s) => s.responseTimeSeconds);
    const m = median(rts);
    return { date: dk, label: labelFor(dk), value: m === null ? -1 : round(m, 1) };
  });
  const hintsByDay: DayPoint[] = dayList.map((dk) => {
    const rows = byDay.get(dk) ?? [];
    return {
      date: dk,
      label: labelFor(dk),
      value: rows.length ? round(rows.reduce((h, s) => h + s.hintsUsed, 0) / rows.length, 1) : -1,
    };
  });

  const games = [...new Set(sessions.map((s) => s.gameType))].map((gameType) => {
    const rows = sessions.filter((s) => s.gameType === gameType);
    const accs = rows.filter((s) => s.accuracy !== null).map((s) => s.accuracy as number);
    const done = rows.filter((s) => s.completed && !s.abandoned && s.accuracy !== null);
    return {
      gameType,
      label: gameLabel(gameType),
      sessions: rows.length,
      accuracy: median(accs),
      maxDifficulty: done.length ? Math.max(...done.map((s) => s.difficulty)) : 0,
    };
  });
  games.sort((a, b) => b.sessions - a.sessions);

  const buckets = (["Morning", "Afternoon", "Evening", "Night"] as const).map((bucket) => {
    const rows = scored.filter((s) => bucketOf(s.playedAt) === bucket);
    return { bucket, sessions: rows.length, accuracy: median(rows.map((s) => s.accuracy as number)) };
  });
  let bestTimeOfDay: PatientReport["bestTimeOfDay"] = null;
  let bestScore = -Infinity;
  for (const b of buckets) {
    if (b.sessions >= 3 && b.accuracy !== null && b.accuracy > bestScore) {
      bestScore = b.accuracy;
      bestTimeOfDay = b.bucket;
    }
  }

  // accuracy trend: first-half median vs second-half median of scored sessions
  const half = Math.floor(scored.length / 2);
  const firstHalf = median(scored.slice(0, half).map((s) => s.accuracy as number));
  const secondHalf = median(scored.slice(scored.length - half).map((s) => s.accuracy as number));
  let accuracyTrend: PatientReport["accuracyTrend"] = "unknown";
  if (scored.length >= 6 && firstHalf !== null && secondHalf !== null) {
    const delta = secondHalf - firstHalf;
    accuracyTrend = Math.abs(delta) < 0.05 ? "steady" : delta > 0 ? "up" : "down";
  }

  const accuracyMedian = median(scored.map((s) => s.accuracy as number));
  const responseSecondsMedian = median(sessions.filter((s) => s.responseTimeSeconds > 0).map((s) => s.responseTimeSeconds));
  const hintsPerSession = sessions.length ? round(sessions.reduce((h, s) => h + s.hintsUsed, 0) / sessions.length, 1) : null;
  const minutesPlayed = round(sessions.reduce((m, s) => m + s.engagementDurationSeconds, 0) / 60, 0);
  const completionRate = completable.length
    ? completable.filter((s) => s.completed && !s.abandoned).length / completable.length
    : null;
  const abandonRate = sessions.length ? sessions.filter((s) => s.abandoned).length / sessions.length : null;
  const activeDays = new Set(sessions.map((s) => dayKey(s.playedAt))).size;

  return {
    period,
    fromISO,
    toISO,
    sessionCount: sessions.length,
    scoredSessionCount: scored.length,
    activeDays,
    totalDays: days,
    minutesPlayed,
    completionRate,
    abandonRate,
    accuracyMedian,
    accuracyTrend,
    responseSecondsMedian: responseSecondsMedian === null ? null : round(responseSecondsMedian, 1),
    hintsPerSession,
    volumeByDay,
    minutesByDay,
    accuracyByDay,
    responseByDay,
    hintsByDay,
    byGame: games,
    byTimeOfDay: buckets,
    bestTimeOfDay,
    summary: summarise({
      period,
      sessions: sessions.length,
      activeDays,
      days,
      accuracyMedian,
      accuracyTrend,
      bestTimeOfDay,
      minutesPlayed,
      topGame: games[0]?.label,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/*  Sample data — shown while a patient has too little real history            */
/* -------------------------------------------------------------------------- */

/** Below this many real sessions, the report screen shows `mockSessions()`. */
export const MIN_SESSIONS_FOR_REAL_REPORT = 5;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A believable set of sessions for a patient who hasn't really started yet, so
 * the report page has something to show in a demo. Deterministic per period.
 * Accuracy drifts gently upward; play is morning/afternoon heavy with a couple
 * of rest days; a small share are abandoned.
 */
export function mockSessions(period: Period, now: Date = new Date()): ReportSession[] {
  const days = period === "week" ? 7 : 30;
  const rand = mulberry32(period === "week" ? 7_2026 : 30_2026);
  const games = ["MEMORY_MATCH", "WHO_IS_THIS", "ROUTINE_BUILDER", "MARKET_MEMORY", "MEMORY_LANE"];
  const out: ReportSession[] = [];

  for (let d = days - 1; d >= 0; d -= 1) {
    if (rand() < 0.25) continue; // a rest day
    const dayStart = new Date(now.getTime() - d * 86_400_000);
    const count = 2 + Math.floor(rand() * 3); // 2–4 activities
    const progress = 1 - d / days; // 0 at the start of the window, 1 now
    for (let k = 0; k < count; k += 1) {
      const gameType = games[Math.floor(rand() * games.length)];
      const calm = gameType === "MEMORY_LANE";
      // 60% → ~85% accuracy over the window, plus noise
      const base = 0.6 + progress * 0.25 + (rand() - 0.5) * 0.15;
      const accuracy = calm ? null : Math.max(0.3, Math.min(0.98, Number(base.toFixed(2))));
      const hour = 8 + Math.floor(rand() * 9); // 08:00–16:59 local
      const playedLocal = new Date(dayStart);
      playedLocal.setUTCHours(hour - Math.round(UTC_OFFSET_MIN / 60), Math.floor(rand() * 60), 0, 0);
      const abandoned = !calm && rand() < 0.1;
      out.push({
        gameType,
        difficulty: 1 + Math.min(3, Math.floor(progress * 3 + rand())),
        accuracy: abandoned ? null : accuracy,
        responseTimeSeconds: calm ? 0 : Number((7 + rand() * 9).toFixed(1)),
        hintsUsed: calm ? 0 : Math.floor(rand() * 3),
        attempts: calm ? 0 : 4 + Math.floor(rand() * 8),
        completed: !abandoned,
        abandoned,
        engagementDurationSeconds: 90 + Math.floor(rand() * 210),
        playedAt: playedLocal.toISOString(),
      });
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Care suggestions derived from the report                                   */
/* -------------------------------------------------------------------------- */

export type CareTip = { tone: "good" | "watch" | "info"; title: string; body: string };

/**
 * Practical, non-clinical suggestions for the caregiver, keyed off what the
 * report shows. Never diagnostic and never about medicines — it is about how to
 * arrange activities and daily rhythm so the patient stays comfortable and
 * engaged. Always returns at least three.
 */
export function reportTips(r: PatientReport): CareTip[] {
  const tips: CareTip[] = [];
  const span = r.period === "week" ? "this week" : "over the last month";

  if ((r.abandonRate ?? 0) >= 0.15 || (r.completionRate !== null && r.completionRate < 0.7)) {
    tips.push({
      tone: "watch",
      title: "Keep sessions short and finishable",
      body: "Several activities were left unfinished. Try 5–10 minute sessions, and end with a calm activity like Memory Lane so they finish on a good note.",
    });
  }

  if (r.activeDays / r.totalDays < 0.5) {
    tips.push({
      tone: "watch",
      title: "Aim for a little every day",
      body: `They were active on only ${r.activeDays} of ${r.totalDays} days. A short session at the same time and place each day helps far more than one long session now and then.`,
    });
  }

  if ((r.hintsPerSession ?? 0) >= 2) {
    tips.push({
      tone: "watch",
      title: "Ease the difficulty a step",
      body: "They are leaning on hints a lot. Dropping the level makes the games feel kind rather than hard, which keeps confidence up.",
    });
  }

  if (r.accuracyTrend === "down") {
    tips.push({
      tone: "watch",
      title: "A gentler week ahead",
      body: "Accuracy has slipped a little. This varies day to day and is not a cause for alarm — keep sessions light, unhurried and familiar for now, and check they are resting and drinking enough water.",
    });
  }

  if ((r.responseSecondsMedian ?? 0) >= 14) {
    tips.push({
      tone: "info",
      title: "There is no hurry",
      body: "They are taking longer to answer. Sit with them, give plenty of time, and praise the effort rather than the score.",
    });
  }

  if (r.bestTimeOfDay) {
    tips.push({
      tone: "info",
      title: `Play in the ${r.bestTimeOfDay.toLowerCase()}`,
      body: `Their best work ${span} was in the ${r.bestTimeOfDay.toLowerCase()}. Try to schedule game time then, when they are freshest.`,
    });
  }

  const strongGame = r.byGame.find((g) => (g.accuracy ?? 0) >= 0.8 && g.maxDifficulty >= 3 && g.sessions >= 3);
  if (strongGame && r.accuracyTrend !== "down") {
    tips.push({
      tone: "good",
      title: `Ready to step up ${strongGame.label}`,
      body: `${strongGame.label} is going really well. A small increase in difficulty will keep it interesting without frustration.`,
    });
  }

  if (r.accuracyTrend === "up") {
    tips.push({
      tone: "good",
      title: "Keep the routine as it is",
      body: "Accuracy is improving. Whatever the current rhythm is, it is working — keep it steady.",
    });
  }

  // General wellbeing — always include one or two, filling to a minimum of three.
  const general: CareTip[] = [
    {
      tone: "info",
      title: "Pair games with something they enjoy",
      body: "A cup of tea, a favourite song afterwards, or sitting in a sunny spot makes the routine something to look forward to.",
    },
    {
      tone: "info",
      title: "Use the familiar faces and places",
      body: "The photos and stories you added power Who Is This? and Memory Lane. Add a few more so recognition practice stays personal.",
    },
    {
      tone: "info",
      title: "Rest, water, daylight",
      body: "Cognitive activity goes best alongside good sleep, staying hydrated, and some time outside each day.",
    },
  ];
  for (const g of general) {
    if (tips.length >= 5) break;
    if (tips.length < 3 || tips.every((t) => t.title !== g.title)) tips.push(g);
  }

  return tips.slice(0, 6);
}

function summarise(x: {
  period: Period;
  sessions: number;
  activeDays: number;
  days: number;
  accuracyMedian: number | null;
  accuracyTrend: PatientReport["accuracyTrend"];
  bestTimeOfDay: PatientReport["bestTimeOfDay"];
  minutesPlayed: number;
  topGame?: string;
}): string {
  const span = x.period === "week" ? "this week" : "over the last 30 days";
  if (x.sessions === 0) return `No activities were recorded ${span}.`;
  const parts: string[] = [];
  parts.push(
    `${x.sessions} ${x.sessions === 1 ? "activity" : "activities"} across ${x.activeDays} of ${x.days} days${
      x.minutesPlayed ? `, about ${x.minutesPlayed} minutes in total` : ""
    }.`,
  );
  if (x.accuracyMedian !== null) {
    const trend =
      x.accuracyTrend === "up"
        ? "and improving"
        : x.accuracyTrend === "down"
          ? "a little lower than earlier in the period"
          : "and steady";
    parts.push(`Accuracy is around ${Math.round(x.accuracyMedian * 100)}% ${trend}.`);
  }
  if (x.topGame) parts.push(`Most-played activity: ${x.topGame}.`);
  if (x.bestTimeOfDay) parts.push(`They do best in the ${x.bestTimeOfDay.toLowerCase()}.`);
  parts.push("This is a summary for care, not a diagnosis.");
  return parts.join(" ");
}
