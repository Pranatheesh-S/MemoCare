/**
 * On-device twin of services/ml-service/app/personalisation/signals.py.
 *
 * Derives the personalisation signals from the patient's own recent sessions so
 * the offline planner can reason the same way the server does. Pure functions —
 * no model, no network.
 */
import type { GameType, PatientSignalsSummary, TimeOfDayPreference } from "@smritisetu/shared-types";
import type { AdaptationSession } from "./types";
import { ADAPTATION } from "./thresholds";
import { detectAnomaly } from "./anomaly";

const CALM_GAME_TYPE = "MEMORY_LANE";
// played_at is UTC; the North-East India deployment is +5:30.
const UTC_OFFSET_MINUTES = 330;
const BUCKET_MIN_SESSIONS = 3;
const DECREASE_ACCURACY = ADAPTATION.decreaseAccuracy;
const ABANDONMENT_RATE = 0.3;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return Number(m.toFixed(3));
}

function newestFirst(sessions: AdaptationSession[]): AdaptationSession[] {
  return [...sessions].sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0));
}

function bucketFor(playedAt: string): TimeOfDayPreference {
  const hour = new Date(new Date(playedAt).getTime() + UTC_OFFSET_MINUTES * 60_000).getUTCHours();
  if (hour >= 5 && hour < 12) return "MORNING";
  if (hour >= 12 && hour < 17) return "AFTERNOON";
  if (hour >= 17 && hour < 22) return "EVENING";
  return "NIGHT";
}

function bestTimeOfDay(scored: AdaptationSession[]): TimeOfDayPreference {
  const groups = new Map<TimeOfDayPreference, AdaptationSession[]>();
  for (const s of scored) {
    const b = bucketFor(s.playedAt);
    groups.set(b, [...(groups.get(b) ?? []), s]);
  }
  let best: TimeOfDayPreference = "UNKNOWN";
  let bestScore = -Infinity;
  for (const [bucket, rows] of groups) {
    const accs = rows.map((r) => r.accuracy).filter((v): v is number => v !== null);
    const medAcc = median(accs);
    if (rows.length < BUCKET_MIN_SESSIONS || medAcc === null) continue;
    const abandonRate = rows.filter((r) => r.abandoned).length / rows.length;
    const score = medAcc - abandonRate;
    if (score > bestScore) {
      bestScore = score;
      best = bucket;
    }
  }
  return best;
}

function repeatedDifficulty(scoredCompleted: AdaptationSession[]): boolean {
  const window = newestFirst(scoredCompleted).slice(0, 4);
  const low = window.filter((s) => (s.accuracy ?? 0) < DECREASE_ACCURACY).length;
  return window.length >= 2 && low >= 2;
}

function preferredActivities(sessions: AdaptationSession[]): {
  ranked: GameType[];
  mostPlayed: GameType | null;
} {
  const recent = newestFirst(sessions).slice(0, 20);
  if (recent.length === 0) return { ranked: [], mostPlayed: null };
  const scores = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const gameType of new Set(recent.map((s) => s.gameType))) {
    const rows = recent.filter((s) => s.gameType === gameType);
    counts.set(gameType, rows.length);
    const finishedRate = rows.filter((s) => s.completed && !s.abandoned).length / rows.length;
    scores.set(gameType, 0.6 * finishedRate + 0.4 * (rows.length / recent.length));
  }
  const ranked = [...scores.keys()].sort(
    (a, b) => (scores.get(b)! - scores.get(a)!) || (counts.get(b)! - counts.get(a)!),
  ) as GameType[];
  const mostPlayed = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)!)[0] as
    | GameType
    | undefined;
  return { ranked, mostPlayed: mostPlayed ?? null };
}

function fatigueLikely(sessions: AdaptationSession[], now: number): boolean {
  const sameStretch = newestFirst(sessions).filter(
    (s) => now - Date.parse(s.playedAt) <= 12 * 3600_000,
  );
  if (sameStretch.length >= 4) return true;
  if (sameStretch.length < 2) return false;
  const latest = sameStretch[0]!;
  const first = sameStretch[sameStretch.length - 1]!;
  if (latest.abandoned) return true;
  if (
    latest.accuracy !== null &&
    first.accuracy !== null &&
    first.accuracy - latest.accuracy >= 0.15
  ) {
    return true;
  }
  if (
    first.engagementDurationSeconds > 0 &&
    latest.engagementDurationSeconds < 0.6 * first.engagementDurationSeconds
  ) {
    return true;
  }
  return false;
}

function responseTimeTrend(scoredCompleted: AdaptationSession[]): PatientSignalsSummary["responseTimeTrend"] {
  const timed = newestFirst(scoredCompleted).filter((s) => s.responseTimeSeconds > 0);
  if (timed.length < 4) return "UNKNOWN";
  const recent = median(timed.slice(0, 3).map((s) => s.responseTimeSeconds));
  const prior = median(timed.slice(3, 6).map((s) => s.responseTimeSeconds));
  if (recent === null || prior === null || prior === 0) return "UNKNOWN";
  const delta = (recent - prior) / prior;
  if (Math.abs(delta) <= 0.15) return "STABLE";
  return delta > 0 ? "UP" : "DOWN";
}

export function deriveSignals(
  sessions: AdaptationSession[],
  now: number = Date.now(),
): PatientSignalsSummary {
  const scored = sessions.filter((s) => s.gameType !== CALM_GAME_TYPE);
  const scoredCompleted = scored.filter(
    (s) => s.completed && !s.abandoned && s.accuracy !== null,
  );
  const recentScored = newestFirst(scored).slice(0, 5);
  const abandonWindow = newestFirst(sessions).slice(0, ADAPTATION.abandonmentWindow);
  const abandonedRate =
    abandonWindow.length > 0
      ? Number((abandonWindow.filter((s) => s.abandoned).length / abandonWindow.length).toFixed(3))
      : null;

  const maxDifficulty: Record<string, number> = {};
  for (const s of scoredCompleted) {
    maxDifficulty[s.gameType] = Math.max(maxDifficulty[s.gameType] ?? 0, s.difficulty);
  }

  const anomaly = detectAnomaly(sessions);
  const repeated = repeatedDifficulty(scoredCompleted);
  const { ranked, mostPlayed } = preferredActivities(sessions);

  return {
    sessionCount: sessions.length,
    scoredSessionCount: scored.length,
    accuracyMedian: median(
      scoredCompleted.map((s) => s.accuracy).filter((v): v is number => v !== null),
    ),
    accuracyRecentMedian: median(
      recentScored.map((s) => s.accuracy).filter((v): v is number => v !== null),
    ),
    responseTimeMedianSeconds: median(
      scored.map((s) => s.responseTimeSeconds).filter((v) => v > 0),
    ),
    responseTimeTrend: responseTimeTrend(scoredCompleted),
    hintsMedian: median(scored.map((s) => s.hintsUsed)),
    repeatedDifficulty: repeated,
    sessionDurationMedianSeconds: median(
      sessions.map((s) => s.engagementDurationSeconds).filter((v) => v > 0),
    ),
    sessionsLast24h: sessions.filter((s) => now - Date.parse(s.playedAt) <= 24 * 3600_000).length,
    abandonedRecentRate: abandonedRate,
    maxDifficultyCompleted: maxDifficulty,
    preferredActivities: ranked,
    mostPlayedActivity: mostPlayed,
    bestTimeOfDay: bestTimeOfDay(scored),
    fatigueLikely: fatigueLikely(sessions, now),
    familiarContentRecommended:
      repeated ||
      (abandonedRate !== null && abandonedRate >= ABANDONMENT_RATE) ||
      (anomaly.available && anomaly.isUnusual),
  };
}
