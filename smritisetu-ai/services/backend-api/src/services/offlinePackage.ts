import type {
  ContentPackRef,
  FamilyContact,
  GameConfig,
  GameType,
  LanguagePackManifest,
  MemoryAsset,
  NEStateId,
  OfflinePackage,
  PatientProfile,
  Schedule,
  SupportedLanguage,
} from "@smritisetu/shared-types";
import {
  DEFAULT_NE_STATE_ID,
  NE_STATE_NAMES,
  NE_STATE_PRIMARY_LANGUAGE,
} from "@smritisetu/shared-types";
import { prisma } from "../lib/prisma";
import { AppError } from "../lib/errors";
import { toDomain as sessionPlanToDomain } from "./personalisation";
import { buildSignedUrl } from "../lib/signedUrl";
import { buildAudioPrompts } from "../data/audioPrompts";
import enLocale from "../data/locales/en.json";
import asLocale from "../data/locales/as.json";
import mniLocale from "../data/locales/mni.json";
import khaLocale from "../data/locales/kha.json";
import grtLocale from "../data/locales/grt.json";
import lusLocale from "../data/locales/lus.json";
import nagLocale from "../data/locales/nag.json";
import neLocale from "../data/locales/ne.json";
import bnLocale from "../data/locales/bn.json";
import trpLocale from "../data/locales/trp.json";
import njzLocale from "../data/locales/njz.json";

// Regional-pack languages are PLACEHOLDER_PENDING_NATIVE_REVIEW stubs; every
// missing key falls back to English in buildLanguagePack below.
const LOCALES: Record<SupportedLanguage, Record<string, string>> = {
  en: enLocale as Record<string, string>,
  as: asLocale as Record<string, string>,
  mni: mniLocale as Record<string, string>,
  kha: khaLocale as Record<string, string>,
  grt: grtLocale as Record<string, string>,
  lus: lusLocale as Record<string, string>,
  nag: nagLocale as Record<string, string>,
  ne: neLocale as Record<string, string>,
  bn: bnLocale as Record<string, string>,
  trp: trpLocale as Record<string, string>,
  njz: njzLocale as Record<string, string>,
};

const LANGUAGE_PACK_VERSION = 1;

/**
 * Builds the manifest a device caches for offline use. Assamese entries that
 * have not been translated fall back to English so a partially translated pack
 * can still be shipped safely.
 */
export function buildLanguagePack(language: SupportedLanguage): LanguagePackManifest {
  const english = LOCALES.en;
  const requested = LOCALES[language] ?? english;
  const translations: Record<string, string> = {};
  for (const key of Object.keys(english)) {
    translations[key] = requested[key] ?? english[key];
  }
  return {
    language,
    version: LANGUAGE_PACK_VERSION,
    translations,
    audioPrompts: buildAudioPrompts(language),
  };
}

export async function buildGameConfig(patientId: string): Promise<GameConfig> {
  const profiles = await prisma.difficultyProfile.findMany({ where: { patientId } });
  const byType = new Map(profiles.map((p) => [p.gameType, p]));
  const allTypes: GameType[] = ["MEMORY_MATCH", "ROUTINE_BUILDER", "WHO_IS_THIS", "MEMORY_LANE"];

  const games = allTypes.map((gameType) => {
    const profile = byType.get(gameType);
    const difficulty = profile?.currentDifficulty ?? 1;
    return {
      gameType,
      enabled: true,
      difficulty,
      hintLevel: profile?.hintLevel ?? 1,
      previewSeconds: gameType === "MEMORY_MATCH" ? previewSecondsFor(difficulty) : undefined,
    };
  });

  // Recommendation comes from the stored ML decision; if none has been made
  // yet the calmest activity is offered.
  const recommended = profiles
    .filter((p) => p.reasonCode === "ABANDONMENT_SUPPORT" || p.reasonCode === "ENGAGEMENT_RECOMMENDATION")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0];

  return {
    patientId,
    games,
    recommendedGameType: (recommended?.gameType as GameType) ?? "MEMORY_MATCH",
    recommendationExplanation:
      recommended?.explanation ?? "A gentle picture-matching activity to begin with.",
  };
}

/** Longer preview at lower difficulty; level 4 keeps a short but non-zero look. */
export function previewSecondsFor(difficulty: number): number {
  const table: Record<number, number> = { 1: 8, 2: 6, 3: 5, 4: 4 };
  return table[difficulty] ?? 6;
}

export async function buildOfflinePackage(
  patientId: string,
  options: { baseUrl?: string; language?: SupportedLanguage } = {},
): Promise<OfflinePackage> {
  const patient = await prisma.patientProfile.findFirst({
    where: { id: patientId, deletedAt: null },
  });
  if (!patient) throw AppError.notFound("Patient");

  const language = options.language ?? (patient.preferredLanguage as SupportedLanguage);
  const baseUrl = options.baseUrl ?? "";

  const [schedules, memories, contacts, difficultyProfiles, sessionPlans, gameConfig] =
    await Promise.all([
      prisma.schedule.findMany({
        where: { patientId, deletedAt: null, active: true },
        orderBy: { createdAt: "asc" },
      }),
      // Revoked consent removes an asset from every future offline package.
      prisma.memoryAsset.findMany({
        where: {
          patientId,
          deletedAt: null,
          consent: { status: "ACTIVE" },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.familyContact.findMany({
        where: { patientId, deletedAt: null },
        orderBy: { displayOrder: "asc" },
      }),
      prisma.difficultyProfile.findMany({ where: { patientId } }),
      prisma.sessionPlan.findMany({ where: { patientId }, orderBy: { gameType: "asc" } }),
      buildGameConfig(patientId),
    ]);

  const stateId = (patient.stateId as NEStateId | null) ?? undefined;
  const communityId = patient.communityId ?? undefined;

  const patientProfile: PatientProfile = {
    patientId: patient.id,
    displayName: patient.displayName,
    preferredName: patient.preferredName,
    age: patient.age,
    location: patient.location,
    preferredLanguage: patient.preferredLanguage as SupportedLanguage,
    stateId,
    communityId,
    photoUrl: patient.photoStorageKey
      ? buildSignedUrl(patient.photoStorageKey, patient.id, baseUrl)
      : undefined,
    reducedMotion: patient.reducedMotion,
    largeText: patient.largeText,
    audioGuidanceEnabled: patient.audioGuidanceEnabled,
  };

  const packStateId = stateId ?? DEFAULT_NE_STATE_ID;
  const contentPack: ContentPackRef = {
    stateId: packStateId,
    stateName: NE_STATE_NAMES[packStateId],
    communityId,
    primaryLanguage: NE_STATE_PRIMARY_LANGUAGE[packStateId],
  };

  return {
    packageVersion: patient.packageVersion,
    generatedAt: new Date().toISOString(),
    patient: patientProfile,
    schedules: schedules.map(
      (s): Schedule => ({
        scheduleId: s.id,
        patientId: s.patientId,
        kind: s.kind,
        titleKey: `myDay.kind.${s.kind}`,
        titleEn: s.titleEn,
        titleAs: s.titleAs ?? undefined,
        detail: s.detail ?? undefined,
        critical: s.critical,
        occurrences: s.occurrences as Schedule["occurrences"],
        missedAfterMinutes: s.missedAfterMinutes,
        snoozeMinutes: s.snoozeMinutes,
        version: s.version,
        active: s.active,
        updatedAt: s.updatedAt.toISOString(),
      }),
    ),
    memories: memories.map(
      (m): MemoryAsset & { mediaUrl?: string; voiceUrl?: string } => ({
        memoryId: m.id,
        patientId: m.patientId,
        category: m.category,
        assetType: m.assetType,
        titleEn: m.titleEn,
        titleAs: m.titleAs ?? undefined,
        captionEn: m.captionEn ?? undefined,
        captionAs: m.captionAs ?? undefined,
        storyEn: m.storyEn ?? undefined,
        storyAs: m.storyAs ?? undefined,
        storageKey: m.storageKey ?? undefined,
        checksum: m.checksum ?? undefined,
        mimeType: m.mimeType ?? undefined,
        sizeBytes: m.sizeBytes ?? undefined,
        personName: m.personName ?? undefined,
        relationshipEn: m.relationshipEn ?? undefined,
        relationshipAs: m.relationshipAs ?? undefined,
        voiceStorageKey: m.voiceStorageKey ?? undefined,
        consentId: m.consentId,
        favourite: m.favourite,
        createdAt: m.createdAt.toISOString(),
        mediaUrl: m.storageKey ? buildSignedUrl(m.storageKey, patientId, baseUrl) : undefined,
        voiceUrl: m.voiceStorageKey ? buildSignedUrl(m.voiceStorageKey, patientId, baseUrl) : undefined,
      }),
    ),
    contacts: contacts.map(
      (c): FamilyContact => ({
        contactId: c.id,
        patientId: c.patientId,
        name: c.name,
        relationshipEn: c.relationshipEn,
        relationshipAs: c.relationshipAs ?? undefined,
        phoneNumber: c.phoneNumber,
        photoStorageKey: c.photoStorageKey ?? undefined,
        photoUrl: c.photoStorageKey ? buildSignedUrl(c.photoStorageKey, patientId, baseUrl) : undefined,
        isPrimary: c.isPrimary,
        displayOrder: c.displayOrder,
      }),
    ),
    difficultyProfiles: difficultyProfiles.map((d) => ({
      patientId: d.patientId,
      gameType: d.gameType,
      currentDifficulty: d.currentDifficulty,
      hintLevel: d.hintLevel,
      reasonCode: d.reasonCode,
      explanation: d.explanation,
      modelVersion: d.modelVersion,
      evidenceSessionCount: d.evidenceSessionCount,
      updatedAt: d.updatedAt.toISOString(),
    })),
    sessionPlans: sessionPlans.map(sessionPlanToDomain),
    languagePack: buildLanguagePack(language),
    gameConfig,
    contentPack,
  };
}

/** Bumped whenever cached content changes so devices know to re-download. */
export async function bumpPackageVersion(patientId: string): Promise<number> {
  const updated = await prisma.patientProfile.update({
    where: { id: patientId },
    data: { packageVersion: { increment: 1 } },
    select: { packageVersion: true },
  });
  return updated.packageVersion;
}
