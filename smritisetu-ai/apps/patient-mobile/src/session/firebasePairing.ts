/**
 * Pair the patient app using a code created in the caregiver app.
 *
 * The caregiver app writes `patients/{id}` + `patients/{id}/memories/*` +
 * `codes/{CODE}` to Firebase project sih-2026-c3a65. Here we redeem the code:
 * read that record, turn it into the same {@link OfflinePackage} the backend
 * would return, and hand it to `storeOfflinePackage` — so the rest of the app
 * (theme from the state, familiar-face games, reminiscence) works unchanged and
 * fully offline afterwards.
 */
import type { NEStateId, OfflinePackage, SupportedLanguage } from "@smritisetu/shared-types";
import {
  DEFAULT_NE_STATE_ID,
  NE_STATE_NAMES,
  NE_STATE_PRIMARY_LANGUAGE,
  NEStateIds,
} from "@smritisetu/shared-types";
import type { PairingProgress, PairingResult } from "./pairingService";

// Firebase and native repositories are imported dynamically inside
// `pairWithFirebaseCode` so this module — and the pure mapping below — can be
// unit-tested without loading the Firebase SDK.

const CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

export function isFirebasePairingCode(raw: string): boolean {
  const code = raw.trim().toUpperCase();
  return CODE_RE.test(code) && /[A-Z]/.test(code);
}

type FirestoreContact = {
  name?: string;
  relationship?: string;
  phone?: string;
  isPrimary?: boolean;
};

type FirestorePatient = {
  displayName?: string;
  preferredName?: string;
  age?: number;
  stateId?: string;
  village?: string | null;
  language?: string;
  largeText?: boolean;
  reducedMotion?: boolean;
  audioGuidance?: boolean;
  photoUrl?: string | null;
  contacts?: FirestoreContact[];
};

type FirestoreMemory = {
  category?: string;
  personName?: string;
  relationship?: string;
  title?: string;
  story?: string;
  favourite?: boolean;
};

function asStateId(value: string | undefined): NEStateId {
  return (NEStateIds as readonly string[]).includes(value ?? "")
    ? (value as NEStateId)
    : DEFAULT_NE_STATE_ID;
}

/**
 * Pure: Firestore docs -> OfflinePackage. Exposed for tests.
 */
export function buildOfflinePackageFromFirestore(
  patientId: string,
  patient: FirestorePatient,
  memories: Array<FirestoreMemory & { id: string }>,
  now: () => string = () => new Date().toISOString(),
): OfflinePackage {
  const generatedAt = now();
  const stateId = asStateId(patient.stateId);
  const stateName = NE_STATE_NAMES[stateId];
  const language = (patient.language ?? NE_STATE_PRIMARY_LANGUAGE[stateId]) as SupportedLanguage;

  const games = ["MEMORY_MATCH", "ROUTINE_BUILDER", "WHO_IS_THIS", "MEMORY_LANE"] as const;

  return {
    packageVersion: 1,
    generatedAt,
    patient: {
      patientId,
      displayName: patient.displayName ?? "Patient",
      preferredName: patient.preferredName || patient.displayName || "Patient",
      age: Number.isFinite(patient.age) ? Number(patient.age) : 70,
      location: [patient.village, stateName].filter(Boolean).join(", ") || stateName,
      preferredLanguage: language,
      stateId,
      communityId: undefined,
      photoUrl: patient.photoUrl || undefined,
      reducedMotion: Boolean(patient.reducedMotion),
      largeText: patient.largeText ?? true,
      audioGuidanceEnabled: patient.audioGuidance ?? true,
    },
    schedules: [],
    contacts: (patient.contacts ?? [])
      .filter((c) => c.name && c.phone)
      .map((c, index) => ({
        contactId: `fb-contact-${index}`,
        patientId,
        name: c.name as string,
        relationshipEn: c.relationship || "Family",
        relationshipAs: undefined,
        phoneNumber: c.phone as string,
        photoStorageKey: undefined,
        photoUrl: undefined,
        isPrimary: c.isPrimary ?? index === 0,
        displayOrder: index,
      })) as OfflinePackage["contacts"],
    memories: memories.map((memory) => ({
      memoryId: memory.id,
      patientId,
      category: (memory.category ?? "HAPPY_MOMENTS") as never,
      assetType: (memory.personName ? "PHOTO" : "STORY") as never,
      titleEn: memory.title ?? "A memory",
      titleAs: undefined,
      captionEn: undefined,
      captionAs: undefined,
      storyEn: memory.story ?? "",
      storyAs: undefined,
      personName: memory.personName || undefined,
      relationshipEn: memory.relationship || undefined,
      relationshipAs: undefined,
      consentId: "firebase-provisioned",
      favourite: Boolean(memory.favourite),
      createdAt: generatedAt,
    })) as OfflinePackage["memories"],
    difficultyProfiles: games.map((gameType) => ({
      patientId,
      gameType,
      currentDifficulty: 2,
      hintLevel: 2,
      reasonCode: "BASELINE",
      explanation: "Starting from a comfortable level.",
      modelVersion: "firebase-provisioned",
      evidenceSessionCount: 0,
      updatedAt: generatedAt,
    })),
    sessionPlans: [],
    languagePack: { language, version: 1, translations: {}, audioPrompts: [] },
    gameConfig: {
      patientId,
      games: games.map((gameType) => ({
        gameType,
        enabled: true,
        difficulty: 2,
        hintLevel: 2,
        previewSeconds: gameType === "MEMORY_MATCH" ? 6 : undefined,
      })),
      recommendedGameType: "MEMORY_MATCH",
      recommendationExplanation: "A gentle place to begin.",
    },
    contentPack: {
      stateId,
      stateName,
      communityId: undefined,
      primaryLanguage: NE_STATE_PRIMARY_LANGUAGE[stateId],
    },
  };
}

const FIREBASE_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export async function pairWithFirebaseCode(
  rawCode: string,
  onProgress: (progress: PairingProgress) => void,
): Promise<PairingResult> {
  const code = rawCode.trim().toUpperCase();
  onProgress({ step: "CONNECTING", messageKey: "pairing.connecting" });

  const { collection, doc, getDoc, getDocs, setDoc } = await import("firebase/firestore");
  const { ensureAnonymousAuth, firestore } = await import("../firebase/config");
  const { secureStorage } = await import("../api/secureStorage");
  const { DeviceRepository } = await import("../db/repositories");
  const { getDeviceIdentifier } = await import("./deviceIdentity");
  const { storeOfflinePackage } = await import("./pairingService");

  try {
    await ensureAnonymousAuth();

    const codeSnap = await getDoc(doc(firestore, "codes", code));
    if (!codeSnap.exists()) {
      onProgress({ step: "FAILED", messageKey: "pairing.invalid" });
      return { ok: false, errorKey: "pairing.invalid" };
    }
    const codeData = codeSnap.data() as { patientId?: string; active?: boolean; expiresAt?: string };
    if (codeData.active === false) {
      onProgress({ step: "FAILED", messageKey: "pairing.invalid" });
      return { ok: false, errorKey: "pairing.invalid" };
    }
    if (codeData.expiresAt && Date.parse(codeData.expiresAt) <= Date.now()) {
      onProgress({ step: "FAILED", messageKey: "pairing.expired" });
      return { ok: false, errorKey: "pairing.expired" };
    }
    const patientId = codeData.patientId;
    if (!patientId) {
      onProgress({ step: "FAILED", messageKey: "pairing.invalid" });
      return { ok: false, errorKey: "pairing.invalid" };
    }

    onProgress({ step: "DOWNLOADING", messageKey: "pairing.downloading" });

    const [patientSnap, memoriesSnap] = await Promise.all([
      getDoc(doc(firestore, "patients", patientId)),
      getDocs(collection(doc(firestore, "patients", patientId), "memories")),
    ]);
    if (!patientSnap.exists()) {
      onProgress({ step: "FAILED", messageKey: "pairing.invalid" });
      return { ok: false, errorKey: "pairing.invalid" };
    }

    const offlinePackage = buildOfflinePackageFromFirestore(
      patientId,
      patientSnap.data() as FirestorePatient,
      memoriesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as FirestoreMemory) })),
    );

    onProgress({ step: "SAVING", messageKey: "pairing.downloading" });

    const deviceIdentifier = await getDeviceIdentifier();
    await secureStorage.setDeviceToken(`firebase-${code}`);
    await new DeviceRepository().save({
      deviceIdentifier,
      deviceId: `fb-${patientId}`,
      patientId,
      pairedAt: new Date().toISOString(),
      tokenExpiresAt: new Date(Date.now() + FIREBASE_TOKEN_TTL_MS).toISOString(),
      packageVersion: offlinePackage.packageVersion,
    });
    await storeOfflinePackage(offlinePackage);

    // Best-effort: let the caregiver see the device has paired. Rules allow a
    // signed-in user to touch only these keys.
    void setDoc(
      doc(firestore, "patients", patientId),
      { pairedAt: new Date().toISOString() },
      { merge: true },
    ).catch(() => undefined);
    void setDoc(
      doc(firestore, "codes", code),
      { usedAt: new Date().toISOString(), lastPairedAt: new Date().toISOString() },
      { merge: true },
    ).catch(() => undefined);

    onProgress({ step: "COMPLETE", messageKey: "pairing.successBody" });
    return {
      ok: true,
      patientId,
      deviceId: `fb-${patientId}`,
      packageVersion: offlinePackage.packageVersion,
    };
  } catch (error) {
    const errorKey =
      error instanceof Error && /offline|network|unavailable/i.test(error.message)
        ? "errors.noInternet"
        : "errors.generic";
    onProgress({ step: "FAILED", messageKey: errorKey });
    return { ok: false, errorKey };
  }
}
