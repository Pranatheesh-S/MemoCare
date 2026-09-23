import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { newEventId } from "../utils/id";
import { secureStorage } from "../api/secureStorage";

/**
 * A stable identifier for this installation.
 *
 * Prefers the platform's own install id so a reinstall on the same phone is
 * recognised as the same device (and can re-pair with the same code). Falls
 * back to a generated UUID kept in secure storage.
 */
export async function getDeviceIdentifier(): Promise<string> {
  const stored = await secureStorage.getDeviceIdentifier();
  if (stored) return stored;

  let identifier: string | null = null;
  try {
    identifier =
      Platform.OS === "android"
        ? Application.getAndroidId()
        : await Application.getIosIdForVendorAsync();
  } catch {
    identifier = null;
  }

  const value = identifier && identifier.length >= 6 ? identifier : newEventId();
  await secureStorage.setDeviceIdentifier(value);
  return value;
}

export function describeDevice(): { platform: string; appVersion: string } {
  return {
    platform: `${Platform.OS}${Device.modelName ? ` ${Device.modelName}` : ""}`.slice(0, 40),
    appVersion: Application.nativeApplicationVersion ?? "1.0.0",
  };
}
