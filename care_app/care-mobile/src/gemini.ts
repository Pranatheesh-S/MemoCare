/**
 * Thin Gemini (Google Generative Language) REST client. Direct `fetch`, no SDK —
 * the app already talks to Firebase over HTTP and this keeps the bundle small.
 *
 * The key is public client config for a rate-limited demo project; it is read
 * from `EXPO_PUBLIC_GEMINI_API_KEY` and falls back to the project's own key so
 * the assistant works with no `.env`. Auth is the `x-goog-api-key` header (a
 * Bearer token is NOT accepted for these keys).
 */
import { trimHistory, type ChatMessage } from "./chatModel";

const MODEL = process.env.EXPO_PUBLIC_GEMINI_MODEL ?? "gemini-2.5-flash";
const API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY ?? "your-gemini-api-key-here";
const BASE = "https://generativelanguage.googleapis.com/v1beta";

async function generate(body: unknown, timeoutMs = 25_000): Promise<unknown> {
  if (!API_KEY) throw new Error("The assistant isn't set up yet (missing Gemini key).");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": API_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`The assistant is unavailable right now (${res.status}).${detail ? ` ${detail.slice(0, 160)}` : ""}`);
    }
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("The assistant took too long to answer. Please try again.");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function extractText(json: unknown): string {
  const j = json as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const parts = j?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p?.text ?? "").join("").trim();
  if (!text) {
    const reason = j?.promptFeedback?.blockReason || j?.candidates?.[0]?.finishReason;
    throw new Error(reason ? `The assistant couldn't answer that (${reason}).` : "The assistant returned nothing.");
  }
  return text;
}

/** A free-text turn for the caregiver chat. */
export async function geminiChat(history: ChatMessage[], systemPrompt: string): Promise<string> {
  const contents = trimHistory(history)
    .filter((m) => m.text.trim())
    .map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const json = await generate({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: 0.6, maxOutputTokens: 800 },
  });
  return extractText(json);
}

/** A single structured-JSON turn (used for routine drafts). */
export async function geminiJson<T>(systemPrompt: string, userPrompt: string, responseSchema: unknown): Promise<T> {
  const json = await generate({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 0.4, responseMimeType: "application/json", responseSchema },
  });
  const text = extractText(json);
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error("The assistant's draft wasn't readable. Please try again.");
  }
}
