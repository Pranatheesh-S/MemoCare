/**
 * Pure helpers for the caregiver assistant chat. Dependency-free so it is
 * unit-tested; the Gemini call itself lives in `gemini.ts`.
 */
export type ChatRole = "user" | "model";
export type ChatMessage = { role: ChatRole; text: string; at: string };

/**
 * The assistant is for a family caregiver of someone living with dementia. It is
 * supportive and practical, and it stays firmly non-diagnostic — the same line
 * the rest of the product holds.
 */
export const CAREGIVER_SYSTEM_PROMPT = [
  "You are Remi's care assistant, helping a family caregiver who looks after an elderly person living with dementia in North-East India.",
  "Answer their everyday questions with warm, plain, practical guidance: daily routines, communication tips, safety at home, managing difficult moments, looking after their own wellbeing, and how to use the Remi app.",
  "Keep answers short and skimmable — a few sentences or a short list. Prefer concrete, gentle suggestions the caregiver can try today.",
  "Be culturally aware of North-East India (food, festivals, languages, joint families) when it helps.",
  "",
  "Boundaries you never cross:",
  "- You do not diagnose, stage, or predict the course of dementia or any condition.",
  "- You do not recommend, name, start, stop, or change any medicine or dose. If asked, say that is a decision for their doctor.",
  "- You do not say the person's condition has 'worsened' or 'declined'.",
  "- For anything urgent — a fall, chest pain, sudden confusion, thoughts of self-harm, a medicine reaction — tell them to contact a doctor or local emergency services now.",
  "End with a brief, kind reminder to check with their doctor or nurse when the question is medical.",
].join("\n");

export const CHAT_DISCLAIMER =
  "Remi's assistant offers general support, not medical advice. For anything about health or medicines, talk to a doctor or nurse.";

export const SUGGESTED_QUESTIONS: readonly string[] = [
  "How do I help with a good morning routine?",
  "What can I do when they get restless in the evening?",
  "They keep asking the same question — what should I say?",
  "How can I make bath time calmer?",
  "I feel exhausted. How do I look after myself too?",
  "How do I set up reminders in Remi?",
];

/** Keep the request small — the last N turns are plenty of context. */
export function trimHistory(messages: ChatMessage[], maxTurns = 16): ChatMessage[] {
  return messages.slice(-maxTurns);
}

/** Never send an empty / whitespace-only prompt. */
export function isSendable(draft: string): boolean {
  return draft.trim().length > 0;
}
