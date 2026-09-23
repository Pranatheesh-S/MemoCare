/**
 * When the device was paired with a caregiver's Firebase code, mirror each
 * completed game session to Firestore so the caregiver app can build weekly and
 * monthly reports. Fire-and-forget: a failure never affects gameplay, and the
 * session is always recorded locally regardless.
 *
 * Firebase imports are dynamic so this module stays out of the non-Firebase
 * (backend / demo) code path and the unit tests.
 */

/** The pairing token from `firebasePairing` starts with this prefix. */
export function isFirebaseSession(token: string | null | undefined): boolean {
  return typeof token === "string" && token.startsWith("firebase-");
}

export type FirebaseSessionSummary = {
  gameType: string;
  difficulty: number;
  accuracy: number | null;
  responseTimeSeconds: number;
  hintsUsed: number;
  attempts: number;
  completed: boolean;
  abandoned: boolean;
  engagementDurationSeconds: number;
  playedAt: string;
};

export async function recordFirebaseSession(
  patientId: string,
  eventId: string,
  session: FirebaseSessionSummary,
): Promise<void> {
  try {
    const { secureStorage } = await import("../api/secureStorage");
    const token = await secureStorage.getDeviceToken();
    if (!isFirebaseSession(token)) return;

    const { doc, serverTimestamp, setDoc } = await import("firebase/firestore");
    const { ensureAnonymousAuth, firestore } = await import("./config");
    await ensureAnonymousAuth();

    await setDoc(doc(firestore, "patients", patientId, "sessions", eventId), {
      gameType: session.gameType,
      difficulty: session.difficulty,
      accuracy: session.accuracy,
      responseTimeSeconds: session.responseTimeSeconds,
      hintsUsed: session.hintsUsed,
      attempts: session.attempts,
      completed: session.completed,
      abandoned: session.abandoned,
      engagementDurationSeconds: session.engagementDurationSeconds,
      playedAt: session.playedAt,
      createdAt: serverTimestamp(),
    });
  } catch {
    /* offline, or not a Firebase pairing — the local record is the source of truth */
  }
}
