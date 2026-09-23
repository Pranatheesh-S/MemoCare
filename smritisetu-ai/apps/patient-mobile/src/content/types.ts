/**
 * Regional content packs.
 *
 * The North Eastern Region is highly diverse and is never represented here as a
 * single culture. Each state has its own pack of familiar objects, places,
 * festivals, foods, music and patterns, in its own primary language, and a pack
 * can carry community-specific material (Khasi / Garo / Jaintia, Bodo, and so
 * on).
 *
 * Packs are pure data and ship inside the app, so they work with no network.
 * The backend only records which pack a patient uses
 * (`PatientProfile.stateId` / `communityId`).
 */
export type {
  ContentPack,
  ContentPackRef,
  ContentPackLanguage,
  ContentPackCommunity,
  CulturalObject,
  CulturalReference,
} from "@smritisetu/shared-types";

import type { CulturalObject } from "@smritisetu/shared-types";

/**
 * A match card resolved for display: the object's own label/illustration and
 * its "place" as a second card. Screens read `labelLocal` when the UI language
 * is the pack's primary language, `labelEn` otherwise.
 */
export type ResolvedMatchObject = CulturalObject;
