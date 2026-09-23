import type { NEStateId, PatientProfile, SupportedLanguage } from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

type Row = {
  patient_id: string;
  display_name: string;
  preferred_name: string;
  age: number;
  location: string;
  preferred_language: string;
  state_id: string | null;
  community_id: string | null;
  photo_url: string | null;
  reduced_motion: number;
  large_text: number;
  audio_guidance_enabled: number;
};

export class PatientRepository extends BaseRepository {
  async upsert(profile: PatientProfile): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO patient_profile (
         patient_id, display_name, preferred_name, age, location, preferred_language,
         state_id, community_id,
         photo_url, reduced_motion, large_text, audio_guidance_enabled, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id) DO UPDATE SET
         display_name = excluded.display_name,
         preferred_name = excluded.preferred_name,
         age = excluded.age,
         location = excluded.location,
         preferred_language = excluded.preferred_language,
         state_id = excluded.state_id,
         community_id = excluded.community_id,
         photo_url = excluded.photo_url,
         reduced_motion = excluded.reduced_motion,
         large_text = excluded.large_text,
         audio_guidance_enabled = excluded.audio_guidance_enabled,
         updated_at = excluded.updated_at`,
      [
        profile.patientId,
        profile.displayName,
        profile.preferredName,
        profile.age,
        profile.location,
        profile.preferredLanguage,
        profile.stateId ?? null,
        profile.communityId ?? null,
        profile.photoUrl ?? null,
        this.toInt(profile.reducedMotion),
        this.toInt(profile.largeText),
        this.toInt(profile.audioGuidanceEnabled),
        new Date().toISOString(),
      ],
    );
  }

  async get(): Promise<PatientProfile | null> {
    const row = await this.db.getFirstAsync<Row>("SELECT * FROM patient_profile LIMIT 1");
    return row ? this.toProfile(row) : null;
  }

  async updatePreferences(
    changes: Partial<Pick<PatientProfile, "preferredLanguage" | "reducedMotion" | "largeText" | "audioGuidanceEnabled">>,
  ): Promise<void> {
    const sets: string[] = [];
    const params: (string | number)[] = [];

    if (changes.preferredLanguage !== undefined) {
      sets.push("preferred_language = ?");
      params.push(changes.preferredLanguage);
    }
    if (changes.reducedMotion !== undefined) {
      sets.push("reduced_motion = ?");
      params.push(this.toInt(changes.reducedMotion));
    }
    if (changes.largeText !== undefined) {
      sets.push("large_text = ?");
      params.push(this.toInt(changes.largeText));
    }
    if (changes.audioGuidanceEnabled !== undefined) {
      sets.push("audio_guidance_enabled = ?");
      params.push(this.toInt(changes.audioGuidanceEnabled));
    }
    if (sets.length === 0) return;

    sets.push("updated_at = ?");
    params.push(new Date().toISOString());
    await this.db.runAsync(`UPDATE patient_profile SET ${sets.join(", ")}`, params);
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM patient_profile");
  }

  private toProfile(row: Row): PatientProfile {
    return {
      patientId: row.patient_id,
      displayName: row.display_name,
      preferredName: row.preferred_name,
      age: row.age,
      location: row.location,
      preferredLanguage: row.preferred_language as SupportedLanguage,
      stateId: (row.state_id as NEStateId | null) ?? undefined,
      communityId: row.community_id ?? undefined,
      photoUrl: row.photo_url ?? undefined,
      reducedMotion: this.bool(row.reduced_motion),
      largeText: this.bool(row.large_text),
      audioGuidanceEnabled: this.bool(row.audio_guidance_enabled),
    };
  }
}
