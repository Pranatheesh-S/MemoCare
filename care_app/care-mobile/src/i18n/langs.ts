/**
 * The languages the caregiver app can show: English plus one North-Eastern
 * language per state. A patient's second language comes from their state.
 * Pure and dependency-free so it is unit-tested.
 */
import { NE_STATES, type NEStateId } from "../model";

export const LANGS = ["en", "as", "njz", "mni", "kha", "lus", "nag", "ne", "trp"] as const;
export type Lang = (typeof LANGS)[number];

/** Name shown in the language picker, in its own script where practical. */
export const LANG_NATIVE_NAME: Record<Lang, string> = {
  en: "English",
  as: "অসমীয়া",
  njz: "Nyishi",
  mni: "ꯃꯤꯇꯩ ꯂꯣꯟ",
  kha: "Khasi",
  lus: "Mizo ṭawng",
  nag: "Nagamese",
  ne: "नेपाली",
  trp: "Kokborok",
};

export const LANG_ENGLISH_NAME: Record<Lang, string> = {
  en: "English",
  as: "Assamese",
  njz: "Nyishi",
  mni: "Manipuri",
  kha: "Khasi",
  lus: "Mizo",
  nag: "Nagamese",
  ne: "Nepali",
  trp: "Kokborok",
};

export function isLang(value: string | null | undefined): value is Lang {
  return !!value && (LANGS as readonly string[]).includes(value);
}

/** The non-English language for a patient, derived from their state. */
export function stateLang(stateId: NEStateId): Lang {
  const code = NE_STATES.find((s) => s.id === stateId)?.language;
  return isLang(code) ? code : "en";
}
