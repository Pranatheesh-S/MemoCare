/**
 * Same cautious defaults as the ML service. A single unusual session never
 * moves the level; difficulty never jumps more than one step.
 */
export const ADAPTATION = {
  minDifficulty: 1,
  maxDifficulty: 4,
  maxHintLevel: 3,
  increaseAccuracy: 0.8,
  increaseMinSessions: 3,
  decreaseAccuracy: 0.5,
  decreaseMinSessions: 2,
  hintThreshold: 2,
  hintMinSessions: 3,
  abandonmentThreshold: 2,
  abandonmentWindow: 5,
  anomalyMinBaseline: 12,
} as const;

export const RULE_ENGINE_VERSION = "on-device-rules-1.0.0";
export const ANOMALY_MODEL_VERSION = "on-device-robust-z-1.0.0";
export const ENGAGEMENT_ENGINE_VERSION = "on-device-engagement-1.0.0";
