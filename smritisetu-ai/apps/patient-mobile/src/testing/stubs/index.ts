/**
 * Minimal stand-ins for the native modules, used only by the integration test.
 *
 * They let the *real* application code — the API client, the pairing service,
 * the repositories and the sync engine — run in plain Node against the live
 * backend, so the mobile half of the demo journey is genuinely exercised rather
 * than mocked.
 */
import { randomUUID } from "node:crypto";

/* ---------------------------- expo-secure-store --------------------------- */

const secureStore = new Map<string, string>();

export const SecureStoreStub = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: "whenUnlocked",
  async setItemAsync(key: string, value: string): Promise<void> {
    secureStore.set(key, value);
  },
  async getItemAsync(key: string): Promise<string | null> {
    return secureStore.get(key) ?? null;
  },
  async deleteItemAsync(key: string): Promise<void> {
    secureStore.delete(key);
  },
};

/* ------------------------------- expo-crypto ------------------------------ */

export const CryptoStub = { randomUUID: () => randomUUID() };

/* ------------------------------ expo-constants ---------------------------- */

export const ConstantsStub = {
  default: {
    expoConfig: {
      extra: {
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000",
        demoMode: true,
        demoPairingCode: "123456",
      },
    },
  },
};

/* ----------------------------- expo-application --------------------------- */

export const ApplicationStub = {
  nativeApplicationVersion: "1.0.0",
  getAndroidId: () => "integration-test-device",
  getIosIdForVendorAsync: async () => "integration-test-device",
};

export const DeviceStub = { modelName: "Integration Test" };

/* -------------------------------- react-native ---------------------------- */

export const PlatformStub = {
  OS: "android",
  select: <T,>(options: { android?: T; ios?: T; default?: T }): T | undefined =>
    options.android ?? options.default,
};

/* --------------------------- expo-notifications --------------------------- */

const scheduled = new Map<string, unknown>();

export const NotificationsStub = {
  AndroidImportance: { HIGH: 4, MAX: 5 },
  AndroidNotificationPriority: { HIGH: "high", MAX: "max" },
  AndroidNotificationVisibility: { PRIVATE: 0 },
  SchedulableTriggerInputTypes: { DATE: "date" },
  setNotificationHandler: () => undefined,
  async getPermissionsAsync() {
    return { granted: true, canAskAgain: true };
  },
  async requestPermissionsAsync() {
    return { granted: true, canAskAgain: true };
  },
  async setNotificationChannelAsync() {
    return undefined;
  },
  async scheduleNotificationAsync(request: unknown) {
    const id = randomUUID();
    scheduled.set(id, request);
    return id;
  },
  async cancelScheduledNotificationAsync(id: string) {
    scheduled.delete(id);
  },
  async cancelAllScheduledNotificationsAsync() {
    scheduled.clear();
  },
  async getAllScheduledNotificationsAsync() {
    return [...scheduled.entries()].map(([identifier, content]) => ({ identifier, content }));
  },
  /** Test-only helper. */
  __scheduledCount: () => scheduled.size,
};

/* ------------------------------- expo-audio ------------------------------- */

export const AudioStub = {
  createAudioPlayer: () => ({ play: () => undefined, remove: () => undefined }),
  setAudioModeAsync: async () => undefined,
};

export const SpeechStub = {
  speak: () => undefined,
  stop: async () => undefined,
  isSpeakingAsync: async () => false,
};

/* ----------------------------- netinfo / sqlite --------------------------- */

export const NetInfoStub = {
  default: {
    addEventListener: () => () => undefined,
    fetch: async () => ({ isConnected: true, isInternetReachable: true }),
  },
};
