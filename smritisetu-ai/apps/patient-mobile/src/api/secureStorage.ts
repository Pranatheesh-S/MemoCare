import * as SecureStore from "expo-secure-store";

const DEVICE_TOKEN_KEY = "smritisetu.deviceToken";
const DEVICE_IDENTIFIER_KEY = "smritisetu.deviceIdentifier";

/**
 * The device token is a credential, so it lives in the platform keystore and
 * never in SQLite, AsyncStorage or a log line.
 */
export const secureStorage = {
  async setDeviceToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  },

  async getDeviceToken(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  async clearDeviceToken(): Promise<void> {
    await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY).catch(() => undefined);
  },

  async setDeviceIdentifier(identifier: string): Promise<void> {
    await SecureStore.setItemAsync(DEVICE_IDENTIFIER_KEY, identifier);
  },

  async getDeviceIdentifier(): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(DEVICE_IDENTIFIER_KEY);
    } catch {
      return null;
    }
  },
};
