import type { FamilyContact, MemoryAssetType, MemoryCategory } from "@smritisetu/shared-types";
import { BaseRepository } from "./base";

export type CachedMemory = {
  memoryId: string;
  patientId: string;
  category: MemoryCategory;
  assetType: MemoryAssetType;
  titleEn: string;
  titleAs?: string;
  captionEn?: string;
  captionAs?: string;
  storyEn?: string;
  storyAs?: string;
  mediaUrl?: string;
  localPath?: string;
  voiceUrl?: string;
  voiceLocalPath?: string;
  personName?: string;
  relationshipEn?: string;
  relationshipAs?: string;
  consentId: string;
  favourite: boolean;
  available: boolean;
  createdAt: string;
};

type Row = {
  memory_id: string;
  patient_id: string;
  category: string;
  asset_type: string;
  title_en: string;
  title_as: string | null;
  caption_en: string | null;
  caption_as: string | null;
  story_en: string | null;
  story_as: string | null;
  media_url: string | null;
  local_path: string | null;
  voice_url: string | null;
  voice_local_path: string | null;
  person_name: string | null;
  relationship_en: string | null;
  relationship_as: string | null;
  consent_id: string;
  favourite: number;
  available: number;
  created_at: string;
};

export class MemoryRepository extends BaseRepository {
  /**
   * Replaces the cache. Anything the server no longer sends — for example an
   * asset whose consent was withdrawn — disappears from the device here.
   */
  async replaceAll(patientId: string, memories: Array<Partial<CachedMemory> & { memoryId: string }>): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      // Favourites are the patient's own choice, so they survive a refresh.
      const favourites = await this.db.getAllAsync<{ memory_id: string }>(
        "SELECT memory_id FROM memory_assets WHERE patient_id = ? AND favourite = 1",
        [patientId],
      );
      const favouriteIds = new Set(favourites.map((f) => f.memory_id));

      await this.db.runAsync("DELETE FROM memory_assets WHERE patient_id = ?", [patientId]);
      for (const memory of memories) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO memory_assets (
             memory_id, patient_id, category, asset_type, title_en, title_as,
             caption_en, caption_as, story_en, story_as, media_url, local_path,
             voice_url, voice_local_path, checksum, mime_type, person_name,
             relationship_en, relationship_as, consent_id, favourite, available, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            memory.memoryId,
            patientId,
            memory.category ?? "HAPPY_MOMENTS",
            memory.assetType ?? "PHOTO",
            memory.titleEn ?? "",
            memory.titleAs ?? null,
            memory.captionEn ?? null,
            memory.captionAs ?? null,
            memory.storyEn ?? null,
            memory.storyAs ?? null,
            memory.mediaUrl ?? null,
            memory.localPath ?? null,
            memory.voiceUrl ?? null,
            memory.voiceLocalPath ?? null,
            null,
            null,
            memory.personName ?? null,
            memory.relationshipEn ?? null,
            memory.relationshipAs ?? null,
            memory.consentId ?? "unknown",
            this.toInt(favouriteIds.has(memory.memoryId) || Boolean(memory.favourite)),
            this.toInt(memory.available ?? true),
            memory.createdAt ?? new Date().toISOString(),
          ],
        );
      }
    });
  }

  async upsert(memory: Partial<CachedMemory> & { memoryId: string; patientId: string }): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO memory_assets (
        memory_id, patient_id, category, asset_type,
        title_en, title_as, caption_en, caption_as,
        story_en, story_as, media_url, local_path,
        voice_url, voice_local_path,
        voice_storage_key, thumbnail_storage_key,
        person_name, relationship_en, relationship_as,
        consent_id, favourite, available, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memory.memoryId,
        memory.patientId,
        memory.category ?? "MY_FAMILY",
        memory.assetType ?? "PHOTO",
        memory.titleEn ?? "",
        memory.titleAs ?? null,
        memory.captionEn ?? null,
        memory.captionAs ?? null,
        memory.storyEn ?? null,
        memory.storyAs ?? null,
        memory.mediaUrl ?? null,
        memory.localPath ?? null,
        memory.voiceUrl ?? null,
        memory.voiceLocalPath ?? null,
        null,
        null,
        memory.personName ?? null,
        memory.relationshipEn ?? null,
        memory.relationshipAs ?? null,
        memory.consentId ?? "unknown",
        this.toInt(Boolean(memory.favourite)),
        this.toInt(memory.available ?? true),
        memory.createdAt ?? new Date().toISOString(),
      ],
    );
  }

  async listByCategory(patientId: string, category?: MemoryCategory): Promise<CachedMemory[]> {
    const rows = category
      ? await this.db.getAllAsync<Row>(
          "SELECT * FROM memory_assets WHERE patient_id = ? AND category = ? ORDER BY created_at DESC",
          [patientId, category],
        )
      : await this.db.getAllAsync<Row>(
          "SELECT * FROM memory_assets WHERE patient_id = ? ORDER BY created_at DESC",
          [patientId],
        );
    return rows.map((row) => this.toMemory(row));
  }

  /** Family photographs with a named person — the "Who Is This?" pool. */
  async listPeople(patientId: string): Promise<CachedMemory[]> {
    const rows = await this.db.getAllAsync<Row>(
      `SELECT * FROM memory_assets
       WHERE patient_id = ? AND person_name IS NOT NULL AND asset_type = 'PHOTO' AND available = 1
       ORDER BY created_at DESC`,
      [patientId],
    );
    return rows.map((row) => this.toMemory(row));
  }

  async listFavourites(patientId: string): Promise<CachedMemory[]> {
    const rows = await this.db.getAllAsync<Row>(
      "SELECT * FROM memory_assets WHERE patient_id = ? AND favourite = 1 ORDER BY created_at DESC",
      [patientId],
    );
    return rows.map((row) => this.toMemory(row));
  }

  async toggleFavourite(memoryId: string): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ favourite: number }>(
      "SELECT favourite FROM memory_assets WHERE memory_id = ?",
      [memoryId],
    );
    if (!row) return false;
    const next = this.bool(row.favourite) ? 0 : 1;
    await this.db.runAsync("UPDATE memory_assets SET favourite = ? WHERE memory_id = ?", [
      next,
      memoryId,
    ]);
    return next === 1;
  }

  /** Marks an asset unavailable so screens show a friendly state, not a crash. */
  async markUnavailable(memoryId: string): Promise<void> {
    await this.db.runAsync("UPDATE memory_assets SET available = 0 WHERE memory_id = ?", [memoryId]);
  }

  async setLocalPath(memoryId: string, localPath: string): Promise<void> {
    await this.db.runAsync(
      "UPDATE memory_assets SET local_path = ?, available = 1 WHERE memory_id = ?",
      [localPath, memoryId],
    );
  }

  async count(patientId: string): Promise<number> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) as count FROM memory_assets WHERE patient_id = ?",
      [patientId],
    );
    return row?.count ?? 0;
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM memory_assets");
  }

  private toMemory(row: Row): CachedMemory {
    return {
      memoryId: row.memory_id,
      patientId: row.patient_id,
      category: row.category as MemoryCategory,
      assetType: row.asset_type as MemoryAssetType,
      titleEn: row.title_en,
      titleAs: row.title_as ?? undefined,
      captionEn: row.caption_en ?? undefined,
      captionAs: row.caption_as ?? undefined,
      storyEn: row.story_en ?? undefined,
      storyAs: row.story_as ?? undefined,
      mediaUrl: row.media_url ?? undefined,
      localPath: row.local_path ?? undefined,
      voiceUrl: row.voice_url ?? undefined,
      voiceLocalPath: row.voice_local_path ?? undefined,
      personName: row.person_name ?? undefined,
      relationshipEn: row.relationship_en ?? undefined,
      relationshipAs: row.relationship_as ?? undefined,
      consentId: row.consent_id,
      favourite: this.bool(row.favourite),
      available: this.bool(row.available),
      createdAt: row.created_at,
    };
  }
}

export class ContactRepository extends BaseRepository {
  async replaceAll(patientId: string, contacts: FamilyContact[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync("DELETE FROM family_contacts WHERE patient_id = ?", [patientId]);
      for (const contact of contacts) {
        await this.db.runAsync(
          `INSERT OR REPLACE INTO family_contacts (
             contact_id, patient_id, name, relationship_en, relationship_as,
             phone_number, photo_url, local_path, is_primary, display_order
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            contact.contactId,
            patientId,
            contact.name,
            contact.relationshipEn,
            contact.relationshipAs ?? null,
            contact.phoneNumber,
            contact.photoUrl ?? null,
            null,
            this.toInt(contact.isPrimary),
            contact.displayOrder,
          ],
        );
      }
    });
  }

  async list(patientId: string): Promise<FamilyContact[]> {
    const rows = await this.db.getAllAsync<{
      contact_id: string;
      patient_id: string;
      name: string;
      relationship_en: string;
      relationship_as: string | null;
      phone_number: string;
      photo_url: string | null;
      is_primary: number;
      display_order: number;
    }>("SELECT * FROM family_contacts WHERE patient_id = ? ORDER BY display_order ASC", [patientId]);

    return rows.map((row) => ({
      contactId: row.contact_id,
      patientId: row.patient_id,
      name: row.name,
      relationshipEn: row.relationship_en,
      relationshipAs: row.relationship_as ?? undefined,
      phoneNumber: row.phone_number,
      photoUrl: row.photo_url ?? undefined,
      isPrimary: this.bool(row.is_primary),
      displayOrder: row.display_order,
    }));
  }

  async listPrimary(patientId: string): Promise<FamilyContact[]> {
    const all = await this.list(patientId);
    const primary = all.filter((c) => c.isPrimary);
    return primary.length > 0 ? primary : all.slice(0, 2);
  }

  async clear(): Promise<void> {
    await this.db.runAsync("DELETE FROM family_contacts");
  }
}
