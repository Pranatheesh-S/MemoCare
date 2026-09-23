import { SupportedLanguages, type SupportedLanguage } from "@smritisetu/shared-types";
import { LanguagePackRepository, SettingsRepository } from "../db/repositories";
import { useAppStore } from "../store/appStore";

export const UI_LANGUAGE_KEY = "uiLanguage";

const VALID = new Set<string>(SupportedLanguages);

/**
 * The screens always open in English. A regional language is applied only after
 * the person taps the language control — never straight from the patient
 * profile. A previously chosen language (any supported one) is restored.
 */
export function resolveUiLanguage(saved: string | null | undefined): SupportedLanguage {
  return saved && VALID.has(saved) ? (saved as SupportedLanguage) : "en";
}

/**
 * Toggles between English and the pack's language. `alternate` is the patient's
 * regional language (Assamese by default); tapping the control moves to it, and
 * tapping again returns to English.
 */
export function nextUiLanguage(
  current: SupportedLanguage,
  alternate: SupportedLanguage = "as",
): SupportedLanguage {
  return current === "en" ? alternate : "en";
}

export async function loadSavedUiLanguage(): Promise<SupportedLanguage> {
  const saved = await new SettingsRepository().get(UI_LANGUAGE_KEY);
  return resolveUiLanguage(saved);
}

export async function applyUiLanguage(next: SupportedLanguage): Promise<void> {
  useAppStore.getState().setLanguage(next);
  await new SettingsRepository().set(UI_LANGUAGE_KEY, next);

  if (next === "en") {
    useAppStore.getState().setDownloadedTranslations(null);
    return;
  }

  const pack = await new LanguagePackRepository().get(next);
  useAppStore.getState().setDownloadedTranslations(
    pack?.translations ?? null,
    pack?.audioPrompts,
  );
}
