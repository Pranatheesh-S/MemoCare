import type { OfflinePackage, SupportedLanguage } from "@smritisetu/shared-types";
import { apiClient } from "../api/client";
import { ApiRequestError, NetworkError, friendlyErrorKey } from "../api/errors";
import { secureStorage } from "../api/secureStorage";
import {
  ContactRepository,
  DeviceRepository,
  DifficultyRepository,
  LanguagePackRepository,
  MemoryRepository,
  PatientRepository,
  ScheduleRepository,
  SessionPlanRepository,
  SettingsRepository,
} from "../db/repositories";
import { storeServerSessionPlans } from "../adaptation/applyPlan";
import { UI_LANGUAGE_KEY } from "../i18n/uiLanguage";
import { DEMO_MODE, DEMO_PAIRING_CODE } from "../api/config";
import { describeDevice, getDeviceIdentifier } from "./deviceIdentity";
import {
  buildLocalDemoPackage,
  LOCAL_DEMO_DEVICE_ID,
  LOCAL_DEMO_PATIENT_ID,
  LOCAL_DEMO_TOKEN,
} from "./localDemoPackage";

export type PairingStep =
  | "IDLE"
  | "CONNECTING"
  | "DOWNLOADING"
  | "SAVING"
  | "COMPLETE"
  | "FAILED";

export type PairingProgress = {
  step: PairingStep;
  /** Translation key describing what is happening or what went wrong. */
  messageKey: string;
};

export type PairingResult =
  | { ok: true; patientId: string; deviceId: string; packageVersion: number }
  | { ok: false; errorKey: string };

/**
 * The whole pairing flow: validate the code, store the credential securely,
 * download the offline package and write it to SQLite.
 *
 * If the download fails after a successful pairing the device is still paired —
 * the patient can use the app, and the package arrives on the next sync.
 */
export async function pairAndDownload(
  pairingCode: string,
  onProgress: (progress: PairingProgress) => void,
): Promise<PairingResult> {
  const code = pairingCode.trim();
  const allowLocalDemo = DEMO_MODE && code === DEMO_PAIRING_CODE;

  // A letter-bearing code was created in the caregiver app (Firebase). The
  // 6-digit demo/backend code path is unchanged.
  const { isFirebasePairingCode, pairWithFirebaseCode } = await import("./firebasePairing");
  if (isFirebasePairingCode(code)) {
    return pairWithFirebaseCode(code, onProgress);
  }

  try {
    return await pairWithBackend(code, onProgress);
  } catch (error) {
    if (allowLocalDemo) {
      return applyLocalDemoPairing(onProgress);
    }
    const errorKey = friendlyErrorKey(error);
    onProgress({ step: "FAILED", messageKey: errorKey });
    return { ok: false, errorKey };
  }
}

async function pairWithBackend(
  pairingCode: string,
  onProgress: (progress: PairingProgress) => void,
): Promise<PairingResult> {
  onProgress({ step: "CONNECTING", messageKey: "pairing.connecting" });

  const deviceIdentifier = await getDeviceIdentifier();
  const { platform, appVersion } = describeDevice();

  const pairing = await apiClient.pairDevice({
    pairingCode,
    deviceIdentifier,
    platform,
    appVersion,
  });

  await secureStorage.setDeviceToken(pairing.deviceToken);

  await new DeviceRepository().save({
    deviceIdentifier,
    deviceId: pairing.deviceId,
    patientId: pairing.patientId,
    pairedAt: new Date().toISOString(),
    tokenExpiresAt: pairing.expiresAt,
    packageVersion: 0,
  });
  await new PatientRepository().upsert(pairing.patient);

  onProgress({ step: "DOWNLOADING", messageKey: "pairing.downloading" });

  try {
    const offlinePackage = await apiClient.getOfflinePackage(
      pairing.patientId,
      pairing.patient.preferredLanguage,
    );
    onProgress({ step: "SAVING", messageKey: "pairing.downloading" });
    await storeOfflinePackage(offlinePackage);
  } catch {
    onProgress({ step: "COMPLETE", messageKey: "pairing.successBody" });
    return {
      ok: true,
      patientId: pairing.patientId,
      deviceId: pairing.deviceId,
      packageVersion: 0,
    };
  }

  onProgress({ step: "COMPLETE", messageKey: "pairing.successBody" });
  return {
    ok: true,
    patientId: pairing.patientId,
    deviceId: pairing.deviceId,
    packageVersion: pairing.packageVersion,
  };
}

async function applyLocalDemoPairing(onProgress: (progress: PairingProgress) => void): Promise<PairingResult> {
  onProgress({ step: "SAVING", messageKey: "pairing.downloading" });

  const deviceIdentifier = await getDeviceIdentifier();
  const offlinePackage = buildLocalDemoPackage();

  await secureStorage.setDeviceToken(LOCAL_DEMO_TOKEN);
  await new DeviceRepository().save({
    deviceIdentifier,
    deviceId: LOCAL_DEMO_DEVICE_ID,
    patientId: LOCAL_DEMO_PATIENT_ID,
    pairedAt: new Date().toISOString(),
    tokenExpiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    packageVersion: offlinePackage.packageVersion,
  });
  await storeOfflinePackage(offlinePackage);

  onProgress({ step: "COMPLETE", messageKey: "pairing.successBody" });
  return {
    ok: true,
    patientId: LOCAL_DEMO_PATIENT_ID,
    deviceId: LOCAL_DEMO_DEVICE_ID,
    packageVersion: offlinePackage.packageVersion,
  };
}

/** Writes a downloaded package into the local database. */
export async function storeOfflinePackage(offlinePackage: OfflinePackage): Promise<void> {
  const patientId = offlinePackage.patient.patientId;

  await new PatientRepository().upsert(offlinePackage.patient);
  await new ScheduleRepository().replaceAll(patientId, offlinePackage.schedules);
  await new ContactRepository().replaceAll(patientId, offlinePackage.contacts);

  await new MemoryRepository().replaceAll(
    patientId,
    (offlinePackage.memories as Array<Record<string, unknown>>).map((memory) => ({
      memoryId: String(memory.memoryId),
      patientId,
      category: memory.category as never,
      assetType: memory.assetType as never,
      titleEn: String(memory.titleEn ?? ""),
      titleAs: memory.titleAs as string | undefined,
      captionEn: memory.captionEn as string | undefined,
      captionAs: memory.captionAs as string | undefined,
      storyEn: memory.storyEn as string | undefined,
      storyAs: memory.storyAs as string | undefined,
      mediaUrl: memory.mediaUrl as string | undefined,
      voiceUrl: memory.voiceUrl as string | undefined,
      personName: memory.personName as string | undefined,
      relationshipEn: memory.relationshipEn as string | undefined,
      relationshipAs: memory.relationshipAs as string | undefined,
      consentId: String(memory.consentId ?? "unknown"),
      favourite: Boolean(memory.favourite),
      available: true,
      createdAt: String(memory.createdAt ?? new Date().toISOString()),
    })),
  );

  const difficulty = new DifficultyRepository();
  const previewByGame = new Map(
    (offlinePackage.gameConfig?.games ?? []).map((game) => [game.gameType, game.previewSeconds]),
  );
  for (const profile of offlinePackage.difficultyProfiles) {
    await difficulty.upsert({
      patientId,
      gameType: profile.gameType,
      currentDifficulty: profile.currentDifficulty,
      hintLevel: profile.hintLevel,
      previewSeconds: previewByGame.get(profile.gameType),
      reasonCode: profile.reasonCode,
      explanation: profile.explanation,
    });
  }

  await storeServerSessionPlans(offlinePackage.sessionPlans);

  await new LanguagePackRepository().save(offlinePackage.languagePack);
  await new DeviceRepository().setPackageVersion(offlinePackage.packageVersion);
}

/**
 * Refreshes cached content when the server reports a newer package version.
 * Silent by design: the patient never sees this happen.
 */
export async function refreshOfflinePackage(
  patientId: string,
  language: SupportedLanguage,
): Promise<boolean> {
  try {
    const offlinePackage = await apiClient.getOfflinePackage(patientId, language);
    await storeOfflinePackage(offlinePackage);
    return true;
  } catch (error) {
    if (error instanceof NetworkError || error instanceof ApiRequestError) return false;
    return false;
  }
}

/** Removes this device's session and cached personal content. */
export async function unpairDevice(): Promise<void> {
  await secureStorage.clearDeviceToken();
  await new MemoryRepository().clear();
  await new ContactRepository().clear();
  await new ScheduleRepository().clear();
  await new PatientRepository().clear();
  await new DeviceRepository().clear();
  await new DifficultyRepository().clear();
  await new SessionPlanRepository().clear();
  await new LanguagePackRepository().clear();
  await new SettingsRepository().set(UI_LANGUAGE_KEY, "en");
}
