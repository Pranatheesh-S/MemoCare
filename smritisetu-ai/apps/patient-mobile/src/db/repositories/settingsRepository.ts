import type {
  AudioPrompt,
  ContentPreference,
  GameType,
  HintModality,
  LanguagePackManifest,
  SessionLength,
  SessionPlan,
  SupportedLanguage,
  TimeOfDayPreference,
} from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

export class SettingsRepository extends BaseRepository {
  async set(key: string, value: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, new Date().toISOString()],
    );
  }

  async get(key: string): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ value: string }>(
      "SELECT value FROM app_settings WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const value = await this.get(key);
    return value === null ? fallback : value === "true";
  }

  async setBoolean(key: string, value: boolean): Promise<void> {
    await this.set(key, value ? "true" : "false");
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM app_settings");
  }
}

export class LanguagePackRepository extends BaseRepository {
  async save(pack: LanguagePackManifest): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO language_packages (language, version, translations, audio_prompts, downloaded_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(language) DO UPDATE SET
         version = excluded.version,
         translations = excluded.translations,
         audio_prompts = excluded.audio_prompts,
         downloaded_at = excluded.downloaded_at`,
      [
        pack.language,
        pack.version,
        JSON.stringify(pack.translations),
        JSON.stringify(pack.audioPrompts ?? []),
        new Date().toISOString(),
      ],
    );
  }

  async get(language: SupportedLanguage): Promise<LanguagePackManifest | null> {
    const row = await this.db.getFirstAsync<{
      language: string;
      version: number;
      translations: string;
      audio_prompts: string;
    }>("SELECT * FROM language_packages WHERE language = ?", [language]);
    if (!row) return null;
    return {
      language: row.language as SupportedLanguage,
      version: row.version,
      translations: this.json<Record<string, string>>(row.translations, {}),
      audioPrompts: this.json<AudioPrompt[]>(row.audio_prompts, []),
    };
  }

  async listDownloaded(): Promise<SupportedLanguage[]> {
    const rows = await this.db.getAllAsync<{ language: string }>(
      "SELECT language FROM language_packages",
    );
    return rows.map((row) => row.language as SupportedLanguage);
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM language_packages");
  }
}

export type LocalDifficultyProfile = {
  patientId: string;
  gameType: GameType;
  currentDifficulty: number;
  hintLevel: number;
  previewSeconds?: number;
  reasonCode?: string;
  explanation?: string;
};

export class DifficultyRepository extends BaseRepository {
  async upsert(profile: LocalDifficultyProfile): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO difficulty_profiles (
         patient_id, game_type, current_difficulty, hint_level, preview_seconds,
         reason_code, explanation, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id, game_type) DO UPDATE SET
         current_difficulty = excluded.current_difficulty,
         hint_level = excluded.hint_level,
         preview_seconds = excluded.preview_seconds,
         reason_code = excluded.reason_code,
         explanation = excluded.explanation,
         updated_at = excluded.updated_at`,
      [
        profile.patientId,
        profile.gameType,
        profile.currentDifficulty,
        profile.hintLevel,
        profile.previewSeconds ?? null,
        profile.reasonCode ?? null,
        profile.explanation ?? null,
        new Date().toISOString(),
      ],
    );
  }

  async get(patientId: string, gameType: GameType): Promise<LocalDifficultyProfile | null> {
    const row = await this.db.getFirstAsync<{
      patient_id: string;
      game_type: string;
      current_difficulty: number;
      hint_level: number;
      preview_seconds: number | null;
      reason_code: string | null;
      explanation: string | null;
    }>("SELECT * FROM difficulty_profiles WHERE patient_id = ? AND game_type = ?", [
      patientId,
      gameType,
    ]);
    if (!row) return null;
    return {
      patientId: row.patient_id,
      gameType: row.game_type as GameType,
      currentDifficulty: row.current_difficulty,
      hintLevel: row.hint_level,
      previewSeconds: row.preview_seconds ?? undefined,
      reasonCode: row.reason_code ?? undefined,
      explanation: row.explanation ?? undefined,
    };
  }

  async list(patientId: string): Promise<LocalDifficultyProfile[]> {
    const rows = await this.db.getAllAsync<{
      patient_id: string;
      game_type: string;
      current_difficulty: number;
      hint_level: number;
      preview_seconds: number | null;
      reason_code: string | null;
      explanation: string | null;
    }>("SELECT * FROM difficulty_profiles WHERE patient_id = ?", [patientId]);
    return rows.map((row) => ({
      patientId: row.patient_id,
      gameType: row.game_type as GameType,
      currentDifficulty: row.current_difficulty,
      hintLevel: row.hint_level,
      previewSeconds: row.preview_seconds ?? undefined,
      reasonCode: row.reason_code ?? undefined,
      explanation: row.explanation ?? undefined,
    }));
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM difficulty_profiles");
  }
}

type SessionPlanRow = {
  patient_id: string;
  game_type: string;
  recommended_game_type: string;
  difficulty: number;
  item_count: number;
  question_count: number;
  preview_seconds: number;
  hint_level: number;
  hint_modality: string;
  session_length: string;
  end_with_calm_activity: number;
  content_preference: string;
  best_time_of_day: string;
  comfort_first: number;
  reason_code: string;
  explanation: string;
  confidence: number;
  source: string;
  model_version: string;
  updated_at: string;
};

function rowToPlan(row: SessionPlanRow): SessionPlan {
  return {
    patientId: row.patient_id,
    gameType: row.game_type as GameType,
    recommendedGameType: row.recommended_game_type as GameType,
    difficulty: row.difficulty,
    itemCount: row.item_count,
    questionCount: row.question_count,
    previewSeconds: row.preview_seconds,
    hintLevel: row.hint_level,
    hintModality: row.hint_modality as HintModality,
    sessionLength: row.session_length as SessionLength,
    endWithCalmActivity: row.end_with_calm_activity === 1,
    contentPreference: row.content_preference as ContentPreference,
    bestTimeOfDay: row.best_time_of_day as TimeOfDayPreference,
    comfortFirst: row.comfort_first === 1,
    reasonCode: row.reason_code,
    explanation: row.explanation,
    confidence: row.confidence,
    source: row.source === "model" ? "model" : "baseline",
    modelVersion: row.model_version,
    isDiagnosis: false,
    updatedAt: row.updated_at,
  };
}

/**
 * The latest AI session plan per activity. Written by the on-device planner
 * after each session and overwritten by the server's plan whenever one syncs
 * (server plans may be Gemini-refined; the device's are rules-only).
 */
export class SessionPlanRepository extends BaseRepository {
  async upsert(plan: SessionPlan): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO session_plans (
         patient_id, game_type, recommended_game_type, difficulty, item_count,
         question_count, preview_seconds, hint_level, hint_modality, session_length,
         end_with_calm_activity, content_preference, best_time_of_day, comfort_first,
         reason_code, explanation, confidence, source, model_version, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id, game_type) DO UPDATE SET
         recommended_game_type = excluded.recommended_game_type,
         difficulty = excluded.difficulty,
         item_count = excluded.item_count,
         question_count = excluded.question_count,
         preview_seconds = excluded.preview_seconds,
         hint_level = excluded.hint_level,
         hint_modality = excluded.hint_modality,
         session_length = excluded.session_length,
         end_with_calm_activity = excluded.end_with_calm_activity,
         content_preference = excluded.content_preference,
         best_time_of_day = excluded.best_time_of_day,
         comfort_first = excluded.comfort_first,
         reason_code = excluded.reason_code,
         explanation = excluded.explanation,
         confidence = excluded.confidence,
         source = excluded.source,
         model_version = excluded.model_version,
         updated_at = excluded.updated_at`,
      [
        plan.patientId,
        plan.gameType,
        plan.recommendedGameType,
        plan.difficulty,
        plan.itemCount,
        plan.questionCount,
        plan.previewSeconds,
        plan.hintLevel,
        plan.hintModality,
        plan.sessionLength,
        plan.endWithCalmActivity ? 1 : 0,
        plan.contentPreference,
        plan.bestTimeOfDay,
        plan.comfortFirst ? 1 : 0,
        plan.reasonCode,
        plan.explanation,
        plan.confidence,
        plan.source,
        plan.modelVersion,
        plan.updatedAt || new Date().toISOString(),
      ],
    );
  }

  async get(patientId: string, gameType: GameType): Promise<SessionPlan | null> {
    const row = await this.db.getFirstAsync<SessionPlanRow>(
      "SELECT * FROM session_plans WHERE patient_id = ? AND game_type = ?",
      [patientId, gameType],
    );
    return row ? rowToPlan(row) : null;
  }

  async list(patientId: string): Promise<SessionPlan[]> {
    const rows = await this.db.getAllAsync<SessionPlanRow>(
      "SELECT * FROM session_plans WHERE patient_id = ?",
      [patientId],
    );
    return rows.map(rowToPlan);
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM session_plans");
  }
}
