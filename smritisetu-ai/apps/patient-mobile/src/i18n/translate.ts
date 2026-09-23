import type { SupportedLanguage } from "@smritisetu/shared-types";
import { BUNDLED_TRANSLATIONS, FALLBACK_LANGUAGE } from "./translations";

export type TranslationParams = Record<string, string | number>;

/**
 * Resolves a key in three steps:
 *   1. the downloaded pack for the requested language
 *   2. the bundled strings for that language
 *   3. English
 *
 * Assamese is a work in progress (see locales/as.json), so an untranslated key
 * must fall back to a real English sentence rather than showing the raw key to
 * a patient. Only a genuinely unknown key surfaces as the key itself, which is
 * a visible signal during development.
 */
export function resolveTranslation(
  key: string,
  language: SupportedLanguage,
  downloaded?: Record<string, string> | null,
): { value: string; usedFallback: boolean } {
  const fromDownloaded = downloaded?.[key];
  if (typeof fromDownloaded === "string" && fromDownloaded.length > 0) {
    return { value: fromDownloaded, usedFallback: false };
  }

  const fromBundled = BUNDLED_TRANSLATIONS[language]?.[key];
  if (typeof fromBundled === "string" && fromBundled.length > 0) {
    return { value: fromBundled, usedFallback: false };
  }

  const fromEnglish = BUNDLED_TRANSLATIONS[FALLBACK_LANGUAGE]?.[key];
  if (typeof fromEnglish === "string" && fromEnglish.length > 0) {
    return { value: fromEnglish, usedFallback: language !== FALLBACK_LANGUAGE };
  }

  return { value: key, usedFallback: true };
}

/** Replaces {{placeholders}}. An unmatched placeholder is removed, not shown. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template.replace(/\{\{\s*\w+\s*\}\}/g, "").trim();
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, name: string) =>
      params[name] !== undefined ? String(params[name]) : "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function translate(
  key: string,
  language: SupportedLanguage,
  params?: TranslationParams,
  downloaded?: Record<string, string> | null,
): string {
  const { value } = resolveTranslation(key, language, downloaded);
  return interpolate(value, params);
}

/** Which greeting key suits the current hour. */
export function greetingKeyForHour(hour: number): string {
  if (hour < 12) return "home.greeting.morning";
  if (hour < 17) return "home.greeting.afternoon";
  if (hour < 21) return "home.greeting.evening";
  return "home.greeting.night";
}
