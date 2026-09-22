import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isLang, type Lang } from "./langs";
import { translate } from "./strings";

export { LANGS, LANG_NATIVE_NAME, LANG_ENGLISH_NAME, isLang, stateLang, type Lang } from "./langs";

const STORE_KEY = "remi.lang";

type Vars = Record<string, string | number>;
type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key in the current language (English fallback). */
  t: (key: string, vars?: Vars) => string;
};

const Ctx = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORE_KEY)
      .then((v) => {
        if (isLang(v)) setLangState(v);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    AsyncStorage.setItem(STORE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback((key: string, vars?: Vars) => translate(lang, key, vars), [lang]);

  const value = useMemo<I18nValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("I18nProvider missing");
  return ctx;
}

/** Shorthand when a component only needs the translator. */
export function useT(): I18nValue["t"] {
  return useI18n().t;
}
