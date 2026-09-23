import { AccessibilityInfo } from "react-native";
import type { AudioPrompt, SupportedLanguage } from "@smritisetu/shared-types";
import { findRecording, type ResolvedPrompt } from "./audioPrompts";
import { audioService } from "./audioService";
import { NarrationEngine, type NarrationPlayer, type NarrationPriority, type PlayableNarration } from "./narration";
import { staticVoiceFor } from "./voiceRegistry";
import { ttsClient } from "./ttsClient";
import { VOICE_RATE_NORMAL, VOICE_RATE_SLOW } from "../api/config";
import { useAppStore } from "../store/appStore";

/**
 * The one way the application speaks.
 *
 * A screen asks for a key or a sentence; what happens next is decided here, not
 * by the screen:
 *
 *   1. a pre-generated clip in the caregiver's cloned voice — instant, offline
 *   2. a clip a family member actually recorded, if one exists for that key
 *   3. the cloned voice generated at runtime, for text that changes
 *   4. the device's own speech engine
 *
 * Step 4 is why turning the voice service off, losing the network or never
 * generating a clip all leave the app working exactly as it did before.
 *
 * Operating-system accessibility is untouched by any of this: every control
 * keeps its `accessibilityLabel`, `accessibilityHint` and `accessibilityRole`,
 * so TalkBack and VoiceOver behave normally.
 */

export type VoiceOptions = {
  /** Speak again even if the same words were just spoken. */
  force?: boolean;
  priority?: NarrationPriority;
  /** Recorded clips from the offline package, when the caller has them. */
  prompts?: AudioPrompt[];
  /** Used when the translated string is missing. */
  englishText?: string;
  language?: SupportedLanguage;
  /**
   * Whether this text may be generated at runtime.
   *
   * False for fixed narration: a button must speak the instant it is touched,
   * so if no clip was pre-generated it goes straight to the device's own voice
   * rather than waiting on a network round trip. True only where the words
   * genuinely change — an interpolated sentence, or a companion reply.
   */
  allowRuntime?: boolean;
};

const DUPLICATE_WINDOW_MS = 12_000;

/**
 * A screen reader already reads every label aloud. Speaking over it is worse
 * than saying nothing, so automatic narration steps back while one is running —
 * but narration the patient asked for by pressing "Repeat instruction" still plays.
 */
const SUPPRESS_WITH_SCREEN_READER =
  (process.env.EXPO_PUBLIC_VOICE_SUPPRESS_WITH_SCREEN_READER ?? "true") === "true";

let screenReaderOn = false;
void AccessibilityInfo.isScreenReaderEnabled()
  .then((enabled) => {
    screenReaderOn = enabled;
  })
  .catch(() => undefined);
AccessibilityInfo.addEventListener("screenReaderChanged", (enabled) => {
  screenReaderOn = enabled;
});

const player: NarrationPlayer = {
  async play(narration: PlayableNarration, onFinished: () => void): Promise<boolean> {
    const rate = useAppStore.getState().voiceSpeed === "slow" ? VOICE_RATE_SLOW : VOICE_RATE_NORMAL;
    const resolved: ResolvedPrompt =
      narration.kind === "asset"
        ? { kind: "asset", source: narration.source, language: currentLanguage() }
        : narration.kind === "uri"
          ? { kind: "recording", uri: narration.uri, language: currentLanguage() }
          : { kind: "speech", text: narration.text, language: narration.language as SupportedLanguage };

    const result = await audioService.play(resolved, {
      key: narration.kind === "system" ? narration.key : undefined,
      onFinished,
      rate,
    });
    return result.spoken;
  },
  async stop(): Promise<void> {
    await audioService.stop();
  },
  async pause(): Promise<void> {
    await audioService.pause();
  },
  async resume(): Promise<void> {
    await audioService.resume();
  },
};

const engine = new NarrationEngine(player);

let lastSpokenIdentity = "";
let lastSpokenAt = 0;

function currentLanguage(): SupportedLanguage {
  return useAppStore.getState().language;
}

function narrationEnabled(): boolean {
  return useAppStore.getState().audioGuidanceEnabled;
}

function repeatedTooSoon(identity: string, force: boolean): boolean {
  if (force) return false;
  return identity === lastSpokenIdentity && Date.now() - lastSpokenAt < DUPLICATE_WINDOW_MS;
}

function remember(identity: string): void {
  lastSpokenIdentity = identity;
  lastSpokenAt = Date.now();
}

/** An utterance that was refused must not block the next honest attempt at it. */
function forget(identity: string): void {
  if (lastSpokenIdentity === identity) {
    lastSpokenIdentity = "";
    lastSpokenAt = 0;
  }
}

function suppressedByScreenReader(priority: NarrationPriority): boolean {
  if (!SUPPRESS_WITH_SCREEN_READER || !screenReaderOn) return false;
  // What the patient explicitly asked for still plays; automatic narration does not.
  return priority !== "user" && priority !== "warning";
}

export const voiceManager = {
  /** Call once at launch so the first instruction is not lost to a silent session. */
  async prepare(): Promise<void> {
    await audioService.prepare();
  },

  /**
   * Speaks a narration key.
   *
   * `text` is the already-translated string, so a pre-generated clip can be
   * used when there is one and the same words can be generated or spoken when
   * there is not.
   */
  async speak(key: string, text: string, options: VoiceOptions = {}): Promise<boolean> {
    const language = options.language ?? currentLanguage();
    const priority = options.priority ?? "user";
    if (!narrationEnabled() || suppressedByScreenReader(priority)) return false;

    const identity = `${language}:${key}:${text}`;
    if (repeatedTooSoon(identity, options.force ?? false)) return true;
    remember(identity);

    const spoken = await engine.speak({
      id: identity,
      priority,
      resolve: () => resolveNarration(key, text, language, options),
    });
    if (!spoken) forget(identity);
    return spoken;
  },

  /**
   * Speaks a fixed key straight from the registry — a button, a screen title.
   *
   * Falls through to the same chain as `speak` when no clip was generated, so a
   * missing clip is never a silent button.
   */
  async speakStatic(key: string, text: string, options: VoiceOptions = {}): Promise<boolean> {
    return this.speak(key, text, options);
  },

  /**
   * Speaks text that changes: a companion reply, a personalised reminder.
   *
   * Never blocks the caller — show the words first, then let the voice catch up.
   */
  async speakDynamic(text: string, options: VoiceOptions = {}): Promise<boolean> {
    const language = options.language ?? currentLanguage();
    const priority = options.priority ?? "response";
    if (!narrationEnabled() || suppressedByScreenReader(priority)) return false;

    const trimmed = text.trim();
    if (!trimmed) return false;

    const identity = `${language}:dynamic:${trimmed}`;
    if (repeatedTooSoon(identity, options.force ?? false)) return true;
    remember(identity);

    const spoken = await engine.speak({
      id: identity,
      priority,
      resolve: () => resolveDynamic(trimmed, language),
    });
    if (!spoken) forget(identity);
    return spoken;
  },

  /**
   * Speaks several lines in order, for a guided introduction.
   *
   * Not for button labels: a queue is only right where a sequence genuinely
   * helps, such as the first time a game is opened.
   */
  async queue(lines: { key?: string; text: string }[], options: VoiceOptions = {}): Promise<boolean> {
    const language = options.language ?? currentLanguage();
    const priority = options.priority ?? "background";
    if (!narrationEnabled() || suppressedByScreenReader(priority)) return false;

    return engine.queue(
      lines
        .filter((line) => line.text.trim().length > 0)
        .map((line) => ({
          id: `${language}:${line.key ?? "line"}:${line.text}`,
          priority,
          resolve: () =>
            line.key
              ? resolveNarration(line.key, line.text, language, options)
              : resolveDynamic(line.text.trim(), language),
        })),
      priority,
    );
  },

  /** Repeats the last thing said — the visible "Repeat instruction" button. */
  async replayLast(): Promise<boolean> {
    if (!narrationEnabled()) return false;
    lastSpokenAt = 0; // an explicit repeat is never a duplicate
    return engine.replayLast();
  },

  async stop(): Promise<void> {
    await engine.stop();
  },

  async pause(): Promise<void> {
    await engine.pause();
  },

  async resume(): Promise<void> {
    await engine.resume();
  },

  isSpeaking(): boolean {
    return engine.isSpeaking();
  },

  /** Plays a family member's own recorded clip, unchanged by any of the above. */
  async playClip(uri: string): Promise<boolean> {
    await engine.stop();
    const result = await audioService.playClip(uri);
    return result.spoken;
  },
};

/** The resolution chain, in order of preference. */
async function resolveNarration(
  key: string,
  text: string,
  language: SupportedLanguage,
  options: VoiceOptions,
): Promise<PlayableNarration | null> {
  const bundled = staticVoiceFor(key, language);
  if (bundled !== null) return { kind: "asset", source: bundled };

  const recorded = findRecording(key, language, options.prompts ?? []);
  if (recorded) return { kind: "uri", uri: recorded.uri };

  const spoken = text.trim().length > 0 && text !== key ? text : (options.englishText ?? key);
  if (options.allowRuntime) return resolveDynamic(spoken, language);

  return { kind: "system", text: spoken, language, key };
}

/** Runtime generation, then the device's own voice. */
async function resolveDynamic(
  text: string,
  language: SupportedLanguage,
): Promise<PlayableNarration | null> {
  const generated = await ttsClient.generate(text, language);
  if (generated) return { kind: "uri", uri: generated.uri };
  return { kind: "system", text, language };
}
