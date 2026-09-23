/**
 * The cloned-voice service, as seen from the device.
 *
 * Used only for text that genuinely changes. Every call is best-effort: it
 * times out, it never throws, and when it cannot answer the caller falls back
 * to the device's own speech engine. Navigation and instructions never depend
 * on it, because they are bundled with the app.
 *
 * The device sends words. It never sends, names or receives a voice.
 */
import { TTS_API_KEY, TTS_API_URL, TTS_ENABLED, TTS_TIMEOUT_MS } from "../api/config";

export type GeneratedVoice = { uri: string; duration: number; cached: boolean };

/** Recently generated clips, so repeating a phrase never waits twice. */
const MEMO_LIMIT = 60;
const memo = new Map<string, GeneratedVoice>();

let lastFailureAt = 0;
let lastFailureReason: string | null = null;
/** After a failure, stop hammering an unreachable service on every tap. */
const BACKOFF_MS = 30_000;

function memoKey(text: string, language: string): string {
  return `${language}|${text.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

function remember(key: string, value: GeneratedVoice): void {
  if (memo.size >= MEMO_LIMIT) {
    const oldest = memo.keys().next().value;
    if (oldest !== undefined) memo.delete(oldest);
  }
  memo.set(key, value);
}

function headers(): Record<string, string> {
  // Skips the ngrok free-tier interstitial warning page when the TTS service
  // is reached through a tunnel instead of the LAN — harmless against a
  // direct LAN connection, where no such page exists.
  const base: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  if (TTS_API_KEY) base["x-api-key"] = TTS_API_KEY;
  return base;
}

async function post(path: string, body: unknown): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    return await fetch(`${TTS_API_URL}${path}`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    lastFailureReason = error instanceof Error ? error.message : String(error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const ttsClient = {
  get enabled(): boolean {
    return TTS_ENABLED;
  },

  /** True while a recent failure is still being backed off. */
  get resting(): boolean {
    return Date.now() - lastFailureAt < BACKOFF_MS;
  },

  lastFailure(): string | null {
    return lastFailureReason;
  },

  /**
   * Speaks changing text in the cloned voice.
   *
   * Returns null whenever the caller should fall back — disabled, unreachable,
   * timed out, or a language the cloned voice does not speak.
   */
  async generate(text: string, language: string): Promise<GeneratedVoice | null> {
    if (!TTS_ENABLED) return null;

    const trimmed = text.trim();
    if (!trimmed) return null;

    const key = memoKey(trimmed, language);
    const known = memo.get(key);
    if (known) return known;

    if (this.resting) return null;

    const response = await post("/tts/generate", { text: trimmed, language });
    if (!response) {
      lastFailureAt = Date.now();
      return null;
    }
    if (!response.ok) {
      // 503 is the service telling us to fall back — expected, not an error.
      lastFailureAt = response.status >= 500 ? Date.now() : lastFailureAt;
      lastFailureReason = `tts responded ${response.status}`;
      return null;
    }

    try {
      const body = (await response.json()) as { audioUrl?: string; duration?: number; cached?: boolean };
      if (!body.audioUrl) return null;
      const generated: GeneratedVoice = {
        uri: `${TTS_API_URL}${body.audioUrl}`,
        duration: body.duration ?? 0,
        cached: body.cached ?? false,
      };
      remember(key, generated);
      lastFailureReason = null;
      return generated;
    } catch (error) {
      lastFailureReason = error instanceof Error ? error.message : String(error);
      return null;
    }
  },

  /** Clears the in-memory map — used when the reference voice changes. */
  forget(): void {
    memo.clear();
    lastFailureAt = 0;
    lastFailureReason = null;
  },
};
