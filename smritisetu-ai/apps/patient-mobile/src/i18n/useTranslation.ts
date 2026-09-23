import { useCallback } from "react";
import { useAppStore } from "../store/appStore";
import { translate, type TranslationParams } from "./translate";

/**
 * The single way screens get text. Never hard-code a user-visible string.
 */
export function useTranslation() {
  const language = useAppStore((state) => state.language);
  const downloadedTranslations = useAppStore((state) => state.downloadedTranslations);

  const t = useCallback(
    (key: string, params?: TranslationParams) =>
      translate(key, language, params, downloadedTranslations),
    [language, downloadedTranslations],
  );

  return { t, language };
}
