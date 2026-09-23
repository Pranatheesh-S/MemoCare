import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase project sih-2026-c3a65 — shared with the caregiver app. The patient
 * app never signs in as a caregiver; it signs in anonymously and reads its
 * patient record via a pairing code (see `session/firebasePairing.ts`).
 *
 * Read from `EXPO_PUBLIC_FIREBASE_*` (put them in `.env`), with the project's
 * own values as the fallback so the app runs with no `.env` at all. Public
 * client config (identical to google-services.json); access is governed by
 * Firestore security rules, not by hiding these values.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyADC0QQOsHqCtndmx07CmbXEhPe_RBR8kw",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "sih-2026-c3a65.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "sih-2026-c3a65",
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "sih-2026-c3a65.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "715013897779",
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "1:715013897779:android:31b478771be11668932d46",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

let anonPromise: Promise<void> | null = null;

/** Ensures an anonymous session so Firestore reads pass the `signedIn()` rule. */
export async function ensureAnonymousAuth(): Promise<void> {
  if (firebaseAuth.currentUser) return;
  if (!anonPromise) {
    anonPromise = signInAnonymously(firebaseAuth)
      .then(() => undefined)
      .catch((error) => {
        anonPromise = null;
        throw error;
      });
  }
  return anonPromise;
}
