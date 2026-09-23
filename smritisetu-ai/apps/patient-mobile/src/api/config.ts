import Constants from "expo-constants";

function readExtra(key: string, fallback: string): string {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const value = extra?.[key];
  return typeof value === "string" ? value : fallback;
}

function getDevHost(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { manifest2?: { extra?: { expoClient?: { hostUri?: string } } } })?.manifest2?.extra?.expoClient?.hostUri ??
    (Constants as unknown as { manifest?: { debuggerHost?: string } })?.manifest?.debuggerHost;
  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return ip;
    }
  }
  return "192.168.1.6";
}

const devHost = getDevHost();

function resolveUrl(url: string, defaultPort: number): string {
  if (!url) return `http://${devHost}:${defaultPort}`;
  if (devHost !== "localhost") {
    if (url.includes("localhost")) return url.replace("localhost", devHost);
    if (url.includes("127.0.0.1")) return url.replace("127.0.0.1", devHost);
  }
  return url;
}

const rawApiUrl = process.env.EXPO_PUBLIC_API_URL ?? readExtra("apiUrl", `http://${devHost}:4000`);
export const API_URL = resolveUrl(rawApiUrl, 4000);

export const API_BASE = `${API_URL}/api/v1`;

export const DEMO_MODE =
  (process.env.EXPO_PUBLIC_DEMO_MODE ?? String(Constants.expoConfig?.extra?.demoMode ?? "true")) === "true";

export const DEMO_PAIRING_CODE =
  process.env.EXPO_PUBLIC_DEMO_PAIRING_CODE ?? readExtra("demoPairingCode", "123456");

export const REQUEST_TIMEOUT_MS = 15000;

const defaultCompanionHttp = API_URL.replace(/:\d+$/, ":8000");
const defaultCompanionWs = defaultCompanionHttp.replace(/^http/, "ws");

const rawCompanionApiUrl =
  process.env.EXPO_PUBLIC_COMPANION_API_URL ?? readExtra("companionApiUrl", defaultCompanionHttp);
export const COMPANION_API_URL = resolveUrl(rawCompanionApiUrl, 8000);

const rawCompanionWsUrl =
  process.env.EXPO_PUBLIC_COMPANION_WS_URL ?? readExtra("companionWsUrl", defaultCompanionWs);
export const COMPANION_WS_URL = resolveUrl(rawCompanionWsUrl, 8000).replace(/^http/, "ws");

/* ------------------------------- Custom voice ------------------------------ */

/**
 * The cloned-voice service. Only ever used for text that changes — a companion
 * reply, a reminder with a name in it. Fixed narration is bundled with the app
 * and never asks the network for anything.
 */
const defaultTtsHttp = API_URL.replace(/:\d+$/, ":8100");

const rawTtsApiUrl = process.env.EXPO_PUBLIC_TTS_API_URL ?? readExtra("ttsApiUrl", defaultTtsHttp);
export const TTS_API_URL = resolveUrl(rawTtsApiUrl, 8100);

export const TTS_ENABLED =
  (process.env.EXPO_PUBLIC_TTS_ENABLED ?? String(Constants.expoConfig?.extra?.ttsEnabled ?? "true")) === "true";

/** Set only when the service is reachable beyond the local network. */
export const TTS_API_KEY = process.env.EXPO_PUBLIC_TTS_API_KEY ?? readExtra("ttsApiKey", "");

/** Generation is slower than a normal request, and must never block the screen. */
export const TTS_TIMEOUT_MS = 20000;

/**
 * Playback speed for narration. 1 is the pace of the reference recording, which
 * is where a calm pace should come from; 0.9 slows it a little for someone who
 * needs longer. Applied by the player, never by stretching the waveform.
 */
export const VOICE_RATE_NORMAL = Number(process.env.EXPO_PUBLIC_VOICE_RATE ?? 1);
export const VOICE_RATE_SLOW = Number(process.env.EXPO_PUBLIC_VOICE_RATE_SLOW ?? 0.9);



