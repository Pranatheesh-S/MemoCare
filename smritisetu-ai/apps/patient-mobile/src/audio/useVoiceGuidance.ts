import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store/appStore";
import { useTranslation } from "../i18n/useTranslation";
import { BUNDLED_TRANSLATIONS } from "../i18n/translations";
import { interpolate } from "../i18n/translate";
import { voiceManager } from "./voiceManager";
import type { TranslationParams } from "../i18n/translate";

/**
 * Voice guidance for a screen.
 *
 * `speak` reads a translation key aloud. `repeat` replays whatever was last
 * spoken — every screen exposes this through a visible "Repeat instruction"
 * button, never a hidden gesture.
 *
 * How the words are produced — a pre-generated clip in the caregiver's voice,
 * one generated as it is needed, or the device's own speech engine — is decided
 * by the voice manager. A screen never needs to know.
 */
export function useVoiceGuidance(fallbackKey?: string) {
  const { t, language } = useTranslation();
  const audioEnabled = useAppStore((state) => state.audioGuidanceEnabled);
  const autoNarration = useAppStore((state) => state.autoNarrationEnabled);
  const audioPrompts = useAppStore((state) => state.audioPrompts);
  const lastSpoken = useRef<{ key: string; params?: TranslationParams } | null>(null);

  const speak = useCallback(
    async (key: string, params?: TranslationParams, force = false) => {
      lastSpoken.current = { key, params };
      if (!audioEnabled) return;
      // `force` marks narration the patient asked for — the Repeat button. With
      // automatic narration switched off, only that still speaks.
      if (!force && !autoNarration) return;

      const text = t(key, params);
      const englishTemplate = BUNDLED_TRANSLATIONS.en[key];
      const englishText = englishTemplate ? interpolate(englishTemplate, params) : undefined;

      // A sentence with a name, a time or a count in it is different every time
      // it is said, so it may be generated as it is needed. A fixed one never
      // waits on the network: it is already a file, or it is the device's voice.
      const interpolated = Boolean(englishTemplate && englishTemplate.includes("{{"));

      await voiceManager.speak(key, text, {
        force,
        language,
        prompts: audioPrompts,
        englishText,
        allowRuntime: interpolated,
        priority: "user",
      });
    },
    [audioEnabled, autoNarration, audioPrompts, language, t],
  );

  const repeat = useCallback(async () => {
    const last = lastSpoken.current;
    if (last) {
      await speak(last.key, last.params, true);
      return;
    }
    if (fallbackKey) {
      await speak(fallbackKey, undefined, true);
    }
  }, [fallbackKey, speak]);

  const stop = useCallback(async () => {
    await voiceManager.stop();
  }, []);

  // Never leave a voice talking over the next screen.
  useEffect(() => () => void voiceManager.stop(), []);

  return { speak, repeat, stop, audioEnabled };
}
