import type { SupportedLanguage } from "@smritisetu/shared-types";
import en from "../../locales/en.json";
import as from "../../locales/as.json";
import mni from "../../locales/mni.json";
import kha from "../../locales/kha.json";
import grt from "../../locales/grt.json";
import lus from "../../locales/lus.json";
import nag from "../../locales/nag.json";
import ne from "../../locales/ne.json";
import bn from "../../locales/bn.json";
import trp from "../../locales/trp.json";
import njz from "../../locales/njz.json";

/**
 * Bundled translations.
 *
 * These ship inside the app so the very first launch — before any pairing or
 * download — is already translated. A downloaded language package layers on top
 * of these at runtime.
 *
 * English and Assamese carry the prototype. The regional-pack languages ship as
 * PLACEHOLDER_PENDING_NATIVE_REVIEW stubs: every key falls back to English (see
 * translate.ts), so each language is usable immediately and gains real strings
 * one single-file review at a time.
 */
export const BUNDLED_TRANSLATIONS: Record<SupportedLanguage, Record<string, string>> = {
  en: en as Record<string, string>,
  as: as as Record<string, string>,
  mni: mni as Record<string, string>,
  kha: kha as Record<string, string>,
  grt: grt as Record<string, string>,
  lus: lus as Record<string, string>,
  nag: nag as Record<string, string>,
  ne: ne as Record<string, string>,
  bn: bn as Record<string, string>,
  trp: trp as Record<string, string>,
  njz: njz as Record<string, string>,
};

export const FALLBACK_LANGUAGE: SupportedLanguage = "en";
