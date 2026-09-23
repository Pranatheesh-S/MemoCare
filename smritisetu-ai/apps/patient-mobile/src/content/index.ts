/**
 * The regional content-pack registry.
 *
 * The North Eastern Region is not one culture. Every patient profile selects a
 * state pack (`PatientProfile.stateId`) and, optionally, a community within it
 * (`communityId`). Packs are pure data bundled in the app so they work offline.
 */
import {
  DEFAULT_NE_STATE_ID,
  NE_STATE_PRIMARY_LANGUAGE,
  type ContentPack,
  type ContentPackRef,
  type NEStateId,
  type SupportedLanguage,
} from "@smritisetu/shared-types";

import { ASSAM_PACK } from "./packs/assam";
import { ARUNACHAL_PACK } from "./packs/arunachal";
import { MANIPUR_PACK } from "./packs/manipur";
import { MEGHALAYA_PACK } from "./packs/meghalaya";
import { MIZORAM_PACK } from "./packs/mizoram";
import { NAGALAND_PACK } from "./packs/nagaland";
import { SIKKIM_PACK } from "./packs/sikkim";
import { TRIPURA_PACK } from "./packs/tripura";

export * from "./types";

export const CONTENT_PACKS: Record<NEStateId, ContentPack> = {
  AS: ASSAM_PACK,
  AR: ARUNACHAL_PACK,
  MN: MANIPUR_PACK,
  ML: MEGHALAYA_PACK,
  MZ: MIZORAM_PACK,
  NL: NAGALAND_PACK,
  SK: SIKKIM_PACK,
  TR: TRIPURA_PACK,
};

/** Ordered list for a state picker in a caregiver-facing setup screen. */
export const CONTENT_PACK_LIST: ContentPack[] = [
  ASSAM_PACK,
  ARUNACHAL_PACK,
  MANIPUR_PACK,
  MEGHALAYA_PACK,
  MIZORAM_PACK,
  NAGALAND_PACK,
  SIKKIM_PACK,
  TRIPURA_PACK,
];

export const DEFAULT_CONTENT_PACK: ContentPack = CONTENT_PACKS[DEFAULT_NE_STATE_ID];

/**
 * Resolves the pack for a patient. An unknown or missing state falls back to
 * the default pack (Assam) so a profile created before regional packs still
 * runs. `communityId` is validated against the pack but does not change the
 * object set yet — community overrides are a documented extension point.
 */
export function resolveContentPack(
  stateId?: NEStateId | null,
  communityId?: string | null,
): ContentPack {
  const pack = (stateId && CONTENT_PACKS[stateId]) || DEFAULT_CONTENT_PACK;
  if (communityId && !pack.communities.some((c) => c.id === communityId)) {
    // Not fatal: the state pack is still the right one to show.
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      console.warn(
        `[content] community "${communityId}" is not declared in the ${pack.stateName} pack`,
      );
    }
  }
  return pack;
}

/** The language the app should narrate in for a pack, unless the patient overrides it. */
export function primaryLanguageFor(stateId?: NEStateId | null): SupportedLanguage {
  return NE_STATE_PRIMARY_LANGUAGE[stateId ?? DEFAULT_NE_STATE_ID];
}

export function contentPackRef(pack: ContentPack, communityId?: string | null): ContentPackRef {
  return {
    stateId: pack.stateId,
    stateName: pack.stateName,
    communityId: communityId ?? undefined,
    primaryLanguage: NE_STATE_PRIMARY_LANGUAGE[pack.stateId],
  };
}

declare const __DEV__: boolean | undefined;
