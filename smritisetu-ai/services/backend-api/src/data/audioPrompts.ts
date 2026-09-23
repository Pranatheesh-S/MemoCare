import type { AudioPrompt, SupportedLanguage } from "@smritisetu/shared-types";

/**
 * Audio prompt manifest.
 *
 * Every important instruction has a prompt key. At runtime the patient app
 * resolves a key in this order:
 *   1. a downloaded/bundled recorded clip (localAssetPath)  — best quality
 *   2. a remote clip fetched during language-pack download  (remoteAssetUrl)
 *   3. on-device text-to-speech over the translated string  — always offline
 * Online text-to-speech is never used for essential offline functions.
 *
 * The prototype ships no recorded audio (real Assamese voice work needs a
 * native speaker), so paths are declared but left unresolved and step 3
 * carries the demo. Drop .m4a files into
 * apps/patient-mobile/assets/audio/<lang>/ and set localAssetPath to switch a
 * prompt onto real recorded audio with no code change.
 */
export const AUDIO_PROMPT_KEYS = [
  "home.greeting.morning",
  "home.greeting.afternoon",
  "home.greeting.evening",
  "home.playGames",
  "home.myDay",
  "home.myMemories",
  "home.callFamily",
  "home.needHelp",
  "pairing.instruction",
  "memoryMatch.instruction",
  "memoryMatch.preview",
  "routineBuilder.instruction",
  "whoIsThis.instruction",
  "memoryLane.instruction",
  "myDay.title",
  "myDay.done",
  "myDay.remindAgain",
  "games.goodAttempt",
  "games.tryTogether",
  "games.doingWell",
  "games.thankYou",
  "games.hint",
  "help.confirm",
  "help.sent",
  "memories.title",
  "callFamily.title",
] as const;

export type AudioPromptKey = (typeof AUDIO_PROMPT_KEYS)[number];

export function buildAudioPrompts(language: SupportedLanguage): AudioPrompt[] {
  return AUDIO_PROMPT_KEYS.map((key) => ({
    key,
    language,
    // Declared, not yet shipped — see the note above.
    localAssetPath: undefined,
    remoteAssetUrl: undefined,
    checksum: undefined,
  }));
}
