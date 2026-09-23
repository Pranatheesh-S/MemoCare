import { SettingsRepository } from "../db/repositories";
import { useAppStore } from "../store/appStore";

/**
 * Narration comfort settings.
 *
 * These describe how this device should sound, not anything about the patient,
 * so they live in the device's own settings table rather than in the patient
 * profile the caregiver's records hold. They apply offline and immediately.
 */
const AUTO_NARRATION_KEY = "voice.autoNarration";
const SPEED_KEY = "voice.speed";

export async function loadVoicePreferences(): Promise<void> {
  try {
    const settings = new SettingsRepository();
    const [auto, speed] = await Promise.all([
      settings.getBoolean(AUTO_NARRATION_KEY, true),
      settings.get(SPEED_KEY),
    ]);
    useAppStore.getState().setAccessibility({
      autoNarrationEnabled: auto,
      voiceSpeed: speed === "slow" ? "slow" : "normal",
    });
  } catch {
    // Defaults are already in the store; a settings read is never worth a failed start.
  }
}

export async function saveAutoNarration(enabled: boolean): Promise<void> {
  useAppStore.getState().setAccessibility({ autoNarrationEnabled: enabled });
  await new SettingsRepository().setBoolean(AUTO_NARRATION_KEY, enabled).catch(() => undefined);
}

export async function saveVoiceSpeed(speed: "normal" | "slow"): Promise<void> {
  useAppStore.getState().setAccessibility({ voiceSpeed: speed });
  await new SettingsRepository().set(SPEED_KEY, speed).catch(() => undefined);
}
