/**
 * The reference sentences a caregiver reads aloud so the patient app's voice
 * assistant can speak in their voice. Pure and dependency-free so it can be
 * unit-tested and reused by any voice-cloning step (the tts-service expects the
 * recording plus this exact transcript).
 */
export const VOICE_SAMPLE_SCRIPT: readonly string[] = [
  "Welcome to Remi. I'm here to guide you and make things simple and comfortable.",
  "Please take your time. There is no need to hurry. Remi will guide you through each step.",
  "Remi can help you remember your daily medicines, appointments, and important activities.",
  "When it is time to take your medicine, Remi will gently remind you.",
  "You can record how you are feeling today. Just choose the option that feels right for you.",
  "Remi includes simple games and activities to help you exercise your memory and thinking skills.",
  "Try each activity at your own pace. There is no need to worry about making mistakes.",
  "If you are unsure what to do, don't worry. Remi is here to guide you.",
  "You can go back at any time or choose another option from the menu.",
  "Your progress can be viewed over time, helping you and your caregiver keep track of your activities.",
  "Remember to follow the instructions given by your doctor or caregiver.",
  "If you need help, you can ask a family member or caregiver to assist you.",
  "Great job! You're doing very well. Keep going one step at a time.",
  "Thank you for completing today's activities. Take some time to relax. Remi will be here whenever you need us.",
] as const;

/** The exact words, joined — stored with the recording for the cloning step. */
export const VOICE_SAMPLE_TRANSCRIPT = VOICE_SAMPLE_SCRIPT.join(" ");

export const VOICE_SAMPLE_MAX_SECONDS = 60;
/** Below this, there isn't enough voice to work with — nudge them to read more. */
export const VOICE_SAMPLE_MIN_SECONDS = 20;
/** base64 length ceiling — keeps the patient doc well under Firestore's 1 MiB. */
export const VOICE_SAMPLE_MAX_BASE64 = 900_000;

export function voiceSampleWordCount(): number {
  return VOICE_SAMPLE_TRANSCRIPT.split(/\s+/).filter(Boolean).length;
}

export type VoiceSampleCheck = { ok: boolean; reason?: string };

/** Gate a finished recording before it is saved. */
export function checkVoiceSample(durationSec: number, base64Length: number): VoiceSampleCheck {
  if (!Number.isFinite(durationSec) || durationSec < VOICE_SAMPLE_MIN_SECONDS) {
    return {
      ok: false,
      reason: `That was only ${Math.max(0, Math.round(durationSec))}s. Read a few more lines so there is enough of your voice.`,
    };
  }
  if (base64Length > VOICE_SAMPLE_MAX_BASE64) {
    return { ok: false, reason: "That recording is too large to save. Try again a little more briskly." };
  }
  return { ok: true };
}

/** "1:04" from seconds. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
