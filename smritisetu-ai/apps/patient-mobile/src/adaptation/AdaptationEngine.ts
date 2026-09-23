/**
 * SmritiSetu — On-device Difficulty Adaptation Engine
 * -----------------------------------------------------
 * Wraps a small TFLite model (trained via train_adaptation_model.py) that
 * predicts the next session's difficulty parameters from recent
 * performance stats. Falls back to simple rule-based logic if the model
 * hasn't loaded yet (e.g. very first app launch) or fails for any reason.
 *
 * Usage:
 *   const engine = new AdaptationEngine();
 *   await engine.loadModel();
 *   const params = await engine.getNextDifficulty(recentSessions);
 *
 * Place the exported model at: assets/models/adaptation_model.tflite
 */

import { HINTS_BY_DIFFICULTY, PREVIEW_SECONDS_BY_DIFFICULTY } from "../games/gameContent";
import { clampHintLevel, clampStep } from "./safety";
import type { AdaptationDecision, AdaptationSession } from "./types";
import type { GameType } from "@smritisetu/shared-types";

export const TFLITE_MODEL_VERSION = "on-device-tflite-1.0.0";

export interface SessionStat {
  accuracy: number; // 0-1
  responseTimeMs: number; // raw ms, will be normalized
  hintsUsed: number; // raw count
  maxHints: number; // hints available that session
  completed: boolean;
}

export interface DifficultyParams {
  itemCount: number; // e.g. 2-6 objects to remember/match
  timeGivenSec: number; // e.g. 10-40 seconds
  hintFrequency: number; // e.g. 0-1, chance/frequency of proactive hints
}

export type InferenceSource = "model" | "fallback" | "default";

// Bounds used to map the model's 0-1 outputs into real game parameters.
const BOUNDS = {
  itemCount: { min: 2, max: 6 },
  timeGivenSec: { min: 10, max: 40 },
  hintFrequency: { min: 0, max: 1 },
};

const MAX_REASONABLE_RESPONSE_TIME_MS = 15000; // used to normalize response time

const GENTLE_START: DifficultyParams = { itemCount: 3, timeGivenSec: 25, hintFrequency: 0.6 };

/**
 * react-native-fast-tflite is not in this iOS binary (needs `pod install`).
 * Importing it throws a fatal Nitro exception that cannot be caught in JS.
 */
const NATIVE_TFLITE_LINKED = false;

type TensorflowModel = {
  runSync: (inputs: ArrayBuffer[]) => ArrayBuffer[];
};

type TensorflowLoader = {
  loadTensorflowModel: (source: number, delegates?: string[]) => Promise<TensorflowModel>;
};

// ---- Engine ------------------------------------------------------------

export class AdaptationEngine {
  private model: TensorflowModel | null = null;
  private modelLoadFailed = false;
  private loadPromise: Promise<void> | null = null;
  lastSource: InferenceSource = "default";

  /** Load the TFLite model. Safe to call once at app startup. */
  async loadModel(): Promise<void> {
    if (this.model || this.modelLoadFailed) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadModelOnce();
    return this.loadPromise;
  }

  private async loadModelOnce(): Promise<void> {
    if (!NATIVE_TFLITE_LINKED) {
      this.modelLoadFailed = true;
      return;
    }

    try {
      const { loadTensorflowModel } = (await import("react-native-fast-tflite")) as TensorflowLoader;
      // Metro packs .tflite as an asset id. Dynamic import keeps Node tests free of the native module.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const asset = require("../../assets/models/adaptation_model.tflite") as number;
      this.model = await loadTensorflowModel(asset, []);
    } catch (err) {
      console.warn("AdaptationEngine: failed to load TFLite model, using rule-based fallback.", err);
      this.modelLoadFailed = true;
      this.model = null;
    }
  }

  /**
   * Given the last few sessions of a given game type, return the
   * difficulty parameters to use for the next session.
   */
  async getNextDifficulty(recentSessions: SessionStat[]): Promise<DifficultyParams> {
    if (recentSessions.length === 0) {
      this.lastSource = "default";
      return { ...GENTLE_START };
    }

    const features = buildFeatureVector(recentSessions);

    if (this.model && !this.modelLoadFailed) {
      try {
        const output = this.runModel(features);
        this.lastSource = "model";
        return denormalize(output);
      } catch (err) {
        console.warn("AdaptationEngine: model inference failed, falling back to rules.", err);
      }
    }

    this.lastSource = "fallback";
    return ruleBasedFallback(features);
  }

  isReady(): boolean {
    return this.model !== null && !this.modelLoadFailed;
  }

  private runModel(features: number[]): number[] {
    if (!this.model) throw new Error("Model not loaded");

    const input = Float32Array.from(features);
    const outputs = this.model.runSync([input.buffer]);
    const first = outputs[0];
    if (!first) throw new Error("Model returned no output");
    const values = Array.from(new Float32Array(first));
    if (values.length < 3) throw new Error("Model output was shorter than 3 values");
    return values;
  }
}

let sharedEngine: AdaptationEngine | null = null;

export function getAdaptationEngine(): AdaptationEngine {
  if (!sharedEngine) sharedEngine = new AdaptationEngine();
  return sharedEngine;
}

/** Test helper: drop the process-wide engine so a fresh instance can be created. */
export function resetAdaptationEngine(): void {
  sharedEngine = null;
}

// ---- Feature engineering -------------------------------------------

export function buildFeatureVector(sessions: SessionStat[]): number[] {
  const recent = sessions.slice(-5); // last up to 5 sessions
  const latest = recent[recent.length - 1];
  if (!latest) return [0, 0.5, 0, 0, 0];

  const avgAccuracy = average(recent.map((s) => s.accuracy));
  const avgResponseTimeNorm = average(
    recent.map((s) => clamp01(s.responseTimeMs / MAX_REASONABLE_RESPONSE_TIME_MS)),
  );
  const avgHintsNorm = average(
    recent.map((s) => (s.maxHints > 0 ? clamp01(s.hintsUsed / s.maxHints) : 0)),
  );
  const completionRate = average(recent.map((s) => (s.completed ? 1 : 0)));

  // recent_trend: how does the latest session compare to the average of
  // the prior sessions (excluding the latest)? Range roughly -1 to 1.
  const prior = recent.slice(0, -1);
  const priorAvgAccuracy = prior.length > 0 ? average(prior.map((s) => s.accuracy)) : avgAccuracy;
  const recentTrend = clamp(-1, 1, latest.accuracy - priorAvgAccuracy);

  return [avgAccuracy, avgResponseTimeNorm, avgHintsNorm, completionRate, recentTrend];
}

export function denormalize([itemCountRaw, timeGivenRaw, hintFreqRaw]: number[]): DifficultyParams {
  return {
    itemCount: Math.round(scale(itemCountRaw, BOUNDS.itemCount)),
    timeGivenSec: Math.round(scale(timeGivenRaw, BOUNDS.timeGivenSec)),
    hintFrequency: Number(scale(hintFreqRaw, BOUNDS.hintFrequency).toFixed(2)),
  };
}

export function ruleBasedFallback(features: number[]): DifficultyParams {
  const [avgAccuracy, avgResponseTimeNorm, avgHintsNorm, completionRate, recentTrend] = features;

  const skillSignal =
    0.4 * avgAccuracy +
    0.2 * (1 - avgResponseTimeNorm) +
    0.2 * (1 - avgHintsNorm) +
    0.1 * completionRate +
    0.1 * ((recentTrend + 1) / 2);

  const itemCountRaw = clamp01(skillSignal);
  const timeGivenRaw = clamp01(1 - skillSignal);
  const hintFreqRaw = clamp01(1 - skillSignal);

  return denormalize([itemCountRaw, timeGivenRaw, hintFreqRaw]);
}

export function toSessionStats(sessions: AdaptationSession[]): SessionStat[] {
  return sessions.map((session) => ({
    accuracy: session.accuracy ?? 0,
    responseTimeMs: session.responseTimeSeconds * 1000,
    hintsUsed: session.hintsUsed,
    maxHints: HINTS_BY_DIFFICULTY[session.difficulty] ?? 3,
    completed: session.completed && !session.abandoned,
  }));
}

/**
 * Maps the model's 0-1 game parameters onto the 1-4 difficulty the existing
 * activities already understand. Never jumps more than one level.
 */
export function mapParamsToDecision(input: {
  params: DifficultyParams;
  source: InferenceSource;
  currentDifficulty: number;
  gameType: GameType;
  evidenceSessionCount: number;
}): AdaptationDecision {
  const proposed = itemCountToDifficulty(input.params.itemCount);
  const recommendedDifficulty = clampStep(input.currentDifficulty, proposed);
  const hintLevel = clampHintLevel(Math.round(1 + input.params.hintFrequency * 2));

  return {
    recommendedDifficulty,
    hintLevel,
    recommendedGameType: input.gameType,
    reasonCode: reasonCodeFor(input.source, input.currentDifficulty, recommendedDifficulty),
    explanation: explanationFor(input.currentDifficulty, recommendedDifficulty),
    confidence: input.source === "model" ? 0.72 : 0.6,
    evidenceSessionCount: input.evidenceSessionCount,
    modelVersion: TFLITE_MODEL_VERSION,
    isDiagnosis: false,
  };
}

export function previewSecondsFromParams(params: DifficultyParams, difficulty: number): number {
  const previewFromModel = Math.round(4 + ((params.timeGivenSec - 10) / 30) * 4);
  const fallback = PREVIEW_SECONDS_BY_DIFFICULTY[difficulty] ?? 6;
  return Math.max(4, Math.min(12, Number.isFinite(previewFromModel) ? previewFromModel : fallback));
}

export function itemCountToDifficulty(itemCount: number): number {
  if (itemCount <= 2) return 1;
  if (itemCount <= 3) return 2;
  if (itemCount <= 4) return 3;
  return 4;
}

function reasonCodeFor(source: InferenceSource, current: number, next: number): string {
  if (source === "default") return "GENTLE_START";
  if (next > current) return source === "model" ? "TFLITE_INCREASE" : "TFLITE_FALLBACK_INCREASE";
  if (next < current) return source === "model" ? "TFLITE_DECREASE" : "TFLITE_FALLBACK_DECREASE";
  return source === "model" ? "TFLITE_MAINTAIN" : "TFLITE_FALLBACK_MAINTAIN";
}

function explanationFor(current: number, next: number): string {
  if (next > current) {
    return "Recent rounds went smoothly, so the next round is a little more challenging.";
  }
  if (next < current) {
    return "The next round is made a little gentler, with more time and support.";
  }
  return "Recent rounds sit comfortably, so the current level continues.";
}

// ---- Small math helpers -------------------------------------------------

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clamp(min: number, max: number, n: number): number {
  return Math.min(max, Math.max(min, n));
}

function scale(value01: number, bounds: { min: number; max: number }): number {
  const raw = Number.isFinite(value01) ? value01 : 0;
  const unit = clamp01(raw);
  return bounds.min + unit * (bounds.max - bounds.min);
}
