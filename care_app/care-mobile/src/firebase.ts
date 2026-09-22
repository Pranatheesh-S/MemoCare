import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, type Auth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase project sih-2026-c3a65.
 *
 * Read from `EXPO_PUBLIC_FIREBASE_*` (put them in `.env`), with the project's
 * own values as the fallback so the app still runs with no `.env` at all. This
 * is public client configuration — the same values ship in google-services.json
 * — so committing the fallback is fine; access is controlled by the Firestore /
 * Storage security rules, not by hiding these keys.
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyADC0QQOsHqCtndmx07CmbXEhPe_RBR8kw",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "sih-2026-c3a65.firebaseapp.com",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "sih-2026-c3a65",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "sih-2026-c3a65.firebasestorage.app",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "715013897779",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "1:715013897779:android:31b478771be11668932d46",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

/**
 * On device, Metro resolves `firebase/auth` to its React Native build, which
 * exposes `getReactNativePersistence` so the session survives an app restart.
 * That symbol isn't in the default (node/browser) types, so it is reached
 * dynamically; `tsc` and the unit tests fall back to the in-memory instance.
 */
function makeAuth(): Auth {
  try {
    const authModule = require("firebase/auth") as {
      getReactNativePersistence?: (storage: unknown) => unknown;
    };
    if (authModule.getReactNativePersistence) {
      return initializeAuth(firebaseApp, {
        persistence: authModule.getReactNativePersistence(AsyncStorage) as never,
      });
    }
  } catch {
    // already initialised (fast refresh) or no RN persistence available
  }
  try {
    return initializeAuth(firebaseApp);
  } catch {
    return getAuth(firebaseApp);
  }
}

export const auth = makeAuth();
export const db = getFirestore(firebaseApp);
// No Cloud Storage: the free Spark plan doesn't include it, so profile photos
// are stored as small base64 JPEGs on the Firestore patient doc (see photo.ts).
