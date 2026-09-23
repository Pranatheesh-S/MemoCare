import { env } from "../config/env";
import { logger } from "./logger";

/**
 * Thin client for the FastAPI personalisation service.
 *
 * The ML service is always treated as optional. If it is slow, down or returns
 * an unexpected shape the caller receives `null` and the backend falls back to
 * the patient's stored difficulty. Games must never be blocked by ML.
 */

export type MlSessionMetric = {
  game_type: string;
  difficulty: number;
  accuracy: number | null;
  response_time_seconds: number;
  hints_used: number;
  attempts: number;
  completed: boolean;
  abandoned: boolean;
  engagement_duration_seconds: number;
  played_at: string;
};

export type MlAdaptationResponse = {
  recommended_difficulty: number;
  hint_level: number;
  recommended_game_type: string;
  reason_code: string;
  explanation: string;
  confidence: number;
  evidence_session_count: number;
  model_version: string;
};

export type MlTrendResponse = {
  status: "STABLE" | "REVIEW_SUGGESTED" | "INSUFFICIENT_DATA";
  reason_code: string;
  explanation: string;
  is_diagnosis: false;
  indicators: Array<{
    name: string;
    current: number | null;
    baseline: number | null;
    direction: "UP" | "DOWN" | "STABLE" | "UNKNOWN";
    sample_size: number;
  }>;
  session_count: number;
  model_version: string;
};

export type MlEngagementResponse = {
  recommended_game_type: string;
  reason_code: string;
  explanation: string;
  model_version: string;
};

export type MlSessionPlanResponse = {
  recommended_game_type: string;
  difficulty: number;
  item_count: number;
  question_count: number;
  preview_seconds: number;
  hint_level: number;
  hint_modality: "VISUAL" | "VOICE" | "BOTH";
  session_length: "SHORT" | "STANDARD";
  end_with_calm_activity: boolean;
  content_preference: "FAMILIAR" | "STANDARD";
  best_time_of_day: "MORNING" | "AFTERNOON" | "EVENING" | "NIGHT" | "UNKNOWN";
  comfort_first: boolean;
  reason_code: string;
  explanation: string;
  confidence: number;
  source: "model" | "baseline";
  signals: Record<string, unknown>;
  model_version: string;
  is_diagnosis: false;
};

async function post<T>(path: string, body: unknown, timeoutMs = env.ML_SERVICE_TIMEOUT_MS): Promise<T | null> {
  if (!env.ML_SERVICE_ENABLED) {
    logger.debug("ML service disabled by configuration", { path });
    return null;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${env.ML_SERVICE_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      logger.warn("ML service returned a non-OK status", { path, status: response.status });
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    logger.warn("ML service unreachable — falling back to stored values", {
      path,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export const mlClient = {
  async recommendDifficulty(input: {
    patient_id: string;
    game_type: string;
    current_difficulty: number;
    sessions: MlSessionMetric[];
  }): Promise<MlAdaptationResponse | null> {
    return post<MlAdaptationResponse>("/v1/adaptation/recommend", input);
  },

  async analyseTrends(input: {
    patient_id: string;
    period: "7d" | "30d";
    sessions: MlSessionMetric[];
    reminder_adherence?: { acknowledged: number; missed: number };
  }): Promise<MlTrendResponse | null> {
    return post<MlTrendResponse>("/v1/trends/analyse", input);
  },

  async recommendEngagement(input: {
    patient_id: string;
    sessions: MlSessionMetric[];
  }): Promise<MlEngagementResponse | null> {
    return post<MlEngagementResponse>("/v1/engagement/recommend", input);
  },

  async buildSessionPlan(input: {
    patient_id: string;
    game_type: string;
    current_difficulty: number;
    enabled_game_types?: string[];
    sessions: MlSessionMetric[];
    locale?: string | null;
    use_gemini?: boolean;
  }): Promise<MlSessionPlanResponse | null> {
    // The plan endpoint may call Gemini, which is slower than the rule engines;
    // give it a longer budget than the other calls before falling back.
    return post<MlSessionPlanResponse>(
      "/v1/personalisation/plan",
      input,
      env.ML_SESSION_PLAN_TIMEOUT_MS,
    );
  },

  async health(): Promise<boolean> {
    if (!env.ML_SERVICE_ENABLED) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(`${env.ML_SERVICE_URL}/health`, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  },
};
