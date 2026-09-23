import type { AudioPrompt, SupportedLanguage } from "@smritisetu/shared-types";

/**
 * Audio prompt resolution.
 *
 * Order of preference:
 *   1. a recorded clip bundled or downloaded for the requested language
 *   2. a recorded clip in English (better a real voice than none)
 *   3. on-device text-to-speech over the translated string
 *
 * Step 3 uses the operating system's speech engine, which works with no
 * network. Online text-to-speech is never used for essential functions.
 *
 * A fourth kind, `asset`, is a clip bundled with the app — the cloned
 * accessibility voice. It is chosen by the voice manager, above this file.
 */
export type ResolvedPrompt =
  | { kind: "recording"; uri: string; language: SupportedLanguage }
  | { kind: "asset"; source: number; language: SupportedLanguage }
  | { kind: "speech"; text: string; language: SupportedLanguage };

/**
 * The recorded clip for a key, if a caregiver has provided one.
 *
 * A real human recording still outranks anything synthesised, so the voice
 * manager checks this before generating speech.
 */
export function findRecording(
  key: string,
  language: SupportedLanguage,
  prompts: AudioPrompt[],
): { uri: string; language: SupportedLanguage } | null {
  const requested = prompts.find(
    (p) => p.key === key && p.language === language && (p.localAssetPath || p.remoteAssetUrl),
  );
  if (requested) {
    return { uri: (requested.localAssetPath ?? requested.remoteAssetUrl) as string, language };
  }

  if (language !== "en") {
    const english = prompts.find(
      (p) => p.key === key && p.language === "en" && (p.localAssetPath || p.remoteAssetUrl),
    );
    if (english) {
      return { uri: (english.localAssetPath ?? english.remoteAssetUrl) as string, language: "en" };
    }
  }
  return null;
}

export function resolveAudioPrompt(
  key: string,
  language: SupportedLanguage,
  prompts: AudioPrompt[],
  translatedText: string,
  englishText?: string,
): ResolvedPrompt {
  const recording = findRecording(key, language, prompts);
  if (recording) {
    return { kind: "recording", uri: recording.uri, language: recording.language };
  }

  // No recording anywhere: speak the text we do have.
  const hasTranslation = translatedText.length > 0 && translatedText !== key;
  if (hasTranslation) return { kind: "speech", text: translatedText, language };
  if (englishText) return { kind: "speech", text: englishText, language: "en" };
  return { kind: "speech", text: key, language: "en" };
}

/** Flatten screen copy (line breaks, extra space) into one calm spoken sentence. */
export function textForSpeech(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Maps our language codes onto the locales the OS speech engines expect. */
export function speechLocaleFor(language: SupportedLanguage): string {
  // Assamese TTS is not available on most devices. Bengali shares the script
  // and is far closer than English, so it is used as the nearest voice; if the
  // device has neither, expo-speech falls back to the system default.
  return language === "as" ? "bn-IN" : "en-IN";
}

export type SpeechMood = "guide" | "cheer";

const CHEER_KEYS = new Set([
  "games.goodAttempt",
  "games.doingWell",
  "games.wellDone",
  "games.thankYou",
  "memoryMatch.matched",
  "memoryMatch.enoughForToday",
  "memoryMatch.nextRound",
  "routineBuilder.correct",
  "whoIsThis.correct",
]);

export function speechMoodFor(key: string): SpeechMood {
  return CHEER_KEYS.has(key) ? "cheer" : "guide";
}

/**
 * Options passed to expo-speech. `useApplicationAudioSession: false` lets iOS
 * create a private playback session so the silent switch does not mute guidance.
 * Cheer lines sit a little higher, and slower, so praise sounds glad and
 * unhurried — not clipped.
 */
export function speechOptionsFor(language: SupportedLanguage, mood: SpeechMood = "guide") {
  const excited = mood === "cheer";
  return {
    language: speechLocaleFor(language),
    rate: excited ? 0.78 : 0.9,
    pitch: excited ? 1.18 : 1.05,
    volume: 1.0,
    useApplicationAudioSession: false,
  };
}
