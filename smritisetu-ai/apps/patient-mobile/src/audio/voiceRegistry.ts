/**
 * The static voice registry.
 *
 * Every fixed sentence the app speaks — a button, a screen title, an
 * instruction, a confirmation — has a clip generated ahead of time in the
 * caregiver's own voice. Looking one up is a map read, so narration starts the
 * moment a card is touched, with no model, no network and no wait.
 *
 * The registry is keyed by language *and* key, and there is deliberately no
 * cross-language fallback: hearing English over an Assamese screen would be
 * worse than the device's own Assamese-adjacent voice, which is what the app
 * falls back to instead.
 */
import { STATIC_VOICE_ASSETS, STATIC_VOICE_COUNT } from "./staticVoiceAssets";

export function voiceAssetKey(key: string, language: string): string {
  return `${language}:${key}`;
}

/** The bundled clip for this key, or null if none was generated. */
export function staticVoiceFor(key: string, language: string): number | null {
  return STATIC_VOICE_ASSETS[voiceAssetKey(key, language)] ?? null;
}

export function hasStaticVoice(key: string, language: string): boolean {
  return staticVoiceFor(key, language) !== null;
}

/** How many clips are bundled. Zero means the app has never had a voice generated. */
export function staticVoiceCount(): number {
  return STATIC_VOICE_COUNT;
}

/** Which languages have bundled narration, for diagnostics and settings copy. */
export function languagesWithStaticVoice(): string[] {
  const languages = new Set<string>();
  for (const composite of Object.keys(STATIC_VOICE_ASSETS)) {
    const [language] = composite.split(":", 1);
    if (language) languages.add(language);
  }
  return [...languages].sort();
}
