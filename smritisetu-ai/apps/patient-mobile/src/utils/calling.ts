import { Linking, Platform } from "react-native";

export type CallResult = { ok: true } | { ok: false; reasonKey: string };

/**
 * Places a call through the device's own dialler.
 *
 * `tel:` is used rather than a direct dial so no call permission is needed and
 * the patient always sees the number before it connects. If the device cannot
 * make calls at all — a tablet, for example — a friendly reason comes back
 * instead of a crash.
 */
export async function callNumber(phoneNumber: string): Promise<CallResult> {
  const sanitised = phoneNumber.replace(/[^\d+]/g, "");
  if (sanitised.length < 3) return { ok: false, reasonKey: "callFamily.unavailable" };

  const url = Platform.OS === "ios" ? `telprompt:${sanitised}` : `tel:${sanitised}`;
  try {
    // On Android 11+, canOpenURL often falsely returns false for 'tel:' due to package 
    // visibility restrictions, so we only strictly check it on iOS.
    if (Platform.OS === "ios") {
      const supported = await Linking.canOpenURL(url);
      if (!supported) return { ok: false, reasonKey: "errors.callPermission" };
    }
    
    await Linking.openURL(url);
    return { ok: true };
  } catch {
    return { ok: false, reasonKey: "errors.callPermission" };
  }
}
