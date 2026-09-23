import * as Speech from "expo-speech";
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import type { SupportedLanguage } from "@smritisetu/shared-types";
import { speechMoodFor, speechOptionsFor, textForSpeech, type ResolvedPrompt } from "./audioPrompts";

/**
 * Playback.
 *
 * The one place that touches the speaker. It knows how to play three things —
 * a bundled clip, a clip at a URI, and the device's own speech engine — and
 * nothing about which of them should be chosen; that is the voice manager's
 * decision.
 *
 * Every call is best-effort: if audio is unavailable for any reason the screen
 * still works and the patient can read the words. Nothing here ever throws into
 * a render path.
 */
export type SpeakResult = { spoken: boolean; via: "recording" | "asset" | "speech" | "none"; reason?: string };

export type PlayOptions = {
  key?: string;
  /** Fires once when the words end, whether spoken or played. */
  onFinished?: () => void;
  /** 1 is the recording's own pace. Applied by the player, not by stretching audio. */
  rate?: number;
};

let currentPlayer: AudioPlayer | null = null;
let currentSubscription: { remove: () => void } | null = null;
let lastFailureReason: string | null = null;
let sessionReady = false;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePlaybackSession(): Promise<void> {
  if (sessionReady) return;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      allowsRecording: false,
      shouldPlayInBackground: false,
    });
    sessionReady = true;
  } catch (error) {
    lastFailureReason = error instanceof Error ? error.message : String(error);
  }
}

/** Plays a clip and reports when it ends, so guided sequences can follow on. */
function playClipSource(source: number | { uri: string }, options?: PlayOptions): void {
  const player = createAudioPlayer(source);
  currentPlayer = player;

  if (options?.rate && options.rate !== 1) {
    try {
      // Pitch correction keeps a slowed voice sounding like the same person.
      player.setPlaybackRate(options.rate, "high");
    } catch {
      // Rate control is a comfort, never a requirement.
    }
  }

  if (options?.onFinished) {
    let done = false;
    currentSubscription = player.addListener("playbackStatusUpdate", (status) => {
      if (done || !status.didJustFinish) return;
      done = true;
      options.onFinished?.();
    });
  }

  player.play();
}

export const audioService = {
  /** Call once at launch so the first instruction is not lost to a silent session. */
  async prepare(): Promise<void> {
    await ensurePlaybackSession();
  },

  async play(resolved: ResolvedPrompt, options?: PlayOptions): Promise<SpeakResult> {
    await this.stop();
    await ensurePlaybackSession();

    try {
      if (resolved.kind === "asset") {
        playClipSource(resolved.source, options);
        return { spoken: true, via: "asset" };
      }
      if (resolved.kind === "recording") {
        playClipSource({ uri: resolved.uri }, options);
        return { spoken: true, via: "recording" };
      }

      Speech.speak(textForSpeech(resolved.text), {
        ...speechOptionsFor(resolved.language, speechMoodFor(options?.key ?? "")),
        onDone: options?.onFinished,
        onStopped: options?.onFinished,
        onError: options?.onFinished,
      });
      return { spoken: true, via: "speech" };
    } catch (error) {
      lastFailureReason = error instanceof Error ? error.message : String(error);
      return { spoken: false, via: "none", reason: lastFailureReason };
    }
  },

  /** Plays a family member's recorded voice clip. */
  async playClip(uri: string): Promise<SpeakResult> {
    return this.play({ kind: "recording", uri, language: "en" as SupportedLanguage });
  },

  async pause(): Promise<void> {
    try {
      currentPlayer?.pause();
    } catch {
      // Nothing was playing.
    }
    try {
      await Speech.pause();
    } catch {
      // Not every platform can pause speech; the caller falls back to stopping.
    }
  },

  async resume(): Promise<void> {
    try {
      currentPlayer?.play();
    } catch {
      // Nothing to resume.
    }
    try {
      await Speech.resume();
    } catch {
      // As above.
    }
  },

  async stop(): Promise<void> {
    let wasSpeaking = false;
    try {
      wasSpeaking = await Speech.isSpeakingAsync();
    } catch {
      wasSpeaking = false;
    }

    if (wasSpeaking) {
      try {
        await Speech.stop();
      } catch {
        // Nothing was speaking.
      }
      // iOS drops a new utterance if it is queued in the same turn as stop.
      await wait(80);
    }

    if (currentSubscription) {
      try {
        currentSubscription.remove();
      } catch {
        // Already detached.
      }
      currentSubscription = null;
    }

    if (currentPlayer) {
      try {
        currentPlayer.pause();
        currentPlayer.remove();
      } catch {
        // Already released.
      }
      currentPlayer = null;
    }
  },

  lastFailure(): string | null {
    return lastFailureReason;
  },
};
