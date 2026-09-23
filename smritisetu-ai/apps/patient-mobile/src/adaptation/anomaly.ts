/**
 * Secondary signal only: is the newest session unusual for this patient?
 *
 * It can only withhold a difficulty increase — never cause one. Isolation
 * Forest lives in the Python service; on the phone we use the same robust
 * MAD z-score fallback, which needs no extra library.
 */
import type { AdaptationSession } from "./types";
import { ADAPTATION, ANOMALY_MODEL_VERSION } from "./thresholds";

const FEATURES = [
  "accuracy",
  "responseTimeSeconds",
  "hintsUsed",
  "engagementDurationSeconds",
] as const;

const CONSTANT_BASELINE_TOLERANCE = 0.1;

export type AnomalyResult = {
  available: boolean;
  isUnusual: boolean;
  method: string;
  modelVersion: string;
  baselineSize: number;
};

function featureRow(session: AdaptationSession): number[] {
  return [
    session.accuracy ?? 0,
    session.responseTimeSeconds,
    session.hintsUsed,
    session.engagementDurationSeconds,
  ];
}

function robustZ(values: number[], candidate: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  const deviations = values.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
  const madMid = Math.floor(deviations.length / 2);
  const mad =
    deviations.length % 2 === 1
      ? deviations[madMid]!
      : (deviations[madMid - 1]! + deviations[madMid]!) / 2;
  if (mad > 0) return Math.abs(candidate - median) / (1.4826 * mad);

  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const stdev = Math.sqrt(variance);
  if (stdev > 0) return Math.abs(candidate - median) / stdev;

  const scale = Math.max(Math.abs(median), 1e-9);
  return Math.abs(candidate - median) / scale > CONSTANT_BASELINE_TOLERANCE ? Number.POSITIVE_INFINITY : 0;
}

export function detectAnomaly(sessions: AdaptationSession[]): AnomalyResult {
  const scored = sessions
    .filter((session) => session.gameType !== "MEMORY_LANE")
    .sort((a, b) => (a.playedAt < b.playedAt ? 1 : a.playedAt > b.playedAt ? -1 : 0));

  if (scored.length <= ADAPTATION.anomalyMinBaseline) {
    return {
      available: false,
      isUnusual: false,
      method: "insufficient_baseline",
      modelVersion: ANOMALY_MODEL_VERSION,
      baselineSize: Math.max(0, scored.length - 1),
    };
  }

  const [candidate, ...baseline] = scored;
  if (!candidate) {
    return {
      available: false,
      isUnusual: false,
      method: "insufficient_baseline",
      modelVersion: ANOMALY_MODEL_VERSION,
      baselineSize: 0,
    };
  }

  const candidateRow = featureRow(candidate);
  const baselineRows = baseline.map(featureRow);
  let unusualFeatures = 0;
  for (let index = 0; index < FEATURES.length; index += 1) {
    const column = baselineRows.map((row) => row[index]!);
    if (robustZ(column, candidateRow[index]!) >= 3) unusualFeatures += 1;
  }

  return {
    available: true,
    isUnusual: unusualFeatures >= 2,
    method: "robust_zscore",
    modelVersion: ANOMALY_MODEL_VERSION,
    baselineSize: baseline.length,
  };
}
