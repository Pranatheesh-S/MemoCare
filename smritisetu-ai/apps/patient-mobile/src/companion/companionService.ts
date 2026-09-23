import { COMPANION_API_URL, COMPANION_WS_URL } from "../api/config";
import type { SupportedLanguage } from "@smritisetu/shared-types";

export type CompanionFlowType = "routine_chat" | "memory_lane" | "story_completion" | "who_is_this";

export type CompanionStatus =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "ERROR"
  | "COMPLETED";

export interface CompanionChatMessage {
  id: string;
  role: "companion" | "user";
  text: string;
  timestamp: number;
}

export interface AsrMetadata {
  audio_duration_s: number;
  words_per_minute: number;
  pause_durations_s: number[];
}

export interface SessionConfig {
  patientId: string;
  patientName?: string;
  flowType: CompanionFlowType;
  language: SupportedLanguage | string;
  /**
   * `key` is set only for a fixed, pre-generated line (an opening or an
   * offline fallback) so the caller can play the bundled cloned-voice clip
   * instead of waiting on a network round trip — undefined for a genuine,
   * one-off backend reply, which always has to be generated live.
   */
  onResponse: (text: string, key?: string) => void;
  onSessionDone?: () => void;
  onError?: (err: string) => void;
  onStatusChange?: (status: CompanionStatus) => void;
}

const FALLBACK_OPENINGS: Record<CompanionFlowType, Record<string, string>> = {
  routine_chat: {
    en: "Good day! It is so wonderful to sit and talk with you. How are you feeling today?",
    as: "নমস্কাৰ! আপোনাৰ সৈতে কথা পাতি বহুত ভাল লাগিল। আজি আপোনাৰ কেনে লাগিছে?",
    hi: "नमस्ते! आपसे बात करके बहुत अच्छा लगा। आज आप कैसा महसूस कर रहे हैं?",
  },
  memory_lane: {
    en: "Let us take a little trip down memory lane. Can you tell me about a festival or happy celebration from your childhood?",
    as: "আহক পুৰণি স্মৃতিলৈ ঘূৰি যাওঁ। ল'ৰালিৰ কোনো উৎসৱ বা সুখৰ দিনৰ কথা ক'ব পাৰিবনে?",
    hi: "चलिए पुरानी यादों में चलते हैं। क्या आप बचपन के किसी मनपसंद त्योहार के बारे में बताएंगे?",
  },
  story_completion: {
    en: "Once upon a time, in a peaceful green village by the river, a gentle breeze was blowing. What do you think happened next?",
    as: "এসময়ত এখন নদীৰ পাৰৰ ধুনীয়া সেউজীয়া গাঁৱত এজাক মৃদু বতাহ বলিছিল। তাৰ পিছত কি হ'ল বাৰু?",
    hi: "एक बार की बात है, एक सुंदर गाँव में नदी किनारे ठंडी हवा चल रही थी। आगे क्या हुआ होगा?",
  },
  who_is_this: {
    en: "I would love to hear about the people close to your heart. Tell me about someone in your family you love dearly.",
    as: "আপোনাৰ মৰমৰ পৰিয়ালৰ বিষয়ে শুনিবলৈ পাই মই সুখী হম। আপোনাৰ কোনো এজন মৰমৰ মানুহৰ বিষয়ে কওকচোন।",
    hi: "मुझे आपके परिवार के बारे में सुनकर बहुत खुशी होगी। अपने किसी प्यारे सदस्य के बारे में कुछ बताइए।",
  },
};

const FALLBACK_OPENING_KEYS: Record<CompanionFlowType, string> = {
  routine_chat: "companion.fallbackOpening.routineChat",
  memory_lane: "companion.fallbackOpening.memoryLane",
  story_completion: "companion.fallbackOpening.storyCompletion",
  who_is_this: "companion.fallbackOpening.whoIsThis",
};

const FALLBACK_RESPONSES: Record<string, string[]> = {
  en: [
    "That is so wonderful to hear. Tell me more about that.",
    "I really love hearing your stories. You speak with such warmth.",
    "Thank you for sharing that with me. It is truly special.",
    "You are doing wonderfully. I am right here listening to you.",
    "That brings a smile to my heart. Take all the time you need.",
  ],
  as: [
    "শুনি বৰ ভাল লাগিল। এই বিষয়ে মোক আৰু অলপ কওকচোন।",
    "আপোনাৰ কথা শুনি বহুত ভাল লাগিছে। আপুনি বৰ সুন্দৰকৈ কয়।",
    "মোক এই কথা কোৱাৰ বাবে ধন্যবাদ।",
    "আপুনি বৰ সুন্দৰকৈ কৈছে। মই আপোনাৰ কথা শুনি আছো।",
    "মনটো বৰ প্ৰসন্ন হৈ পৰিল। আপোনাৰ সময় লৈ কওক।",
  ],
  hi: [
    "यह सुनकर बहुत अच्छा लगा। मुझे इसके बारे में और बताइए।",
    "आपकी बातें सुनकर मन खुश हो गया।",
    "मेरे साथ यह साझा करने के लिए धन्यवाद।",
    "आप बहुत अच्छा बता रहे हैं। मैं सुन रहा हूँ।",
    "कोई जल्दी नहीं है, आराम से अपनी बात कहिए।",
  ],
};

export class CompanionClient {
  private ws: WebSocket | null = null;
  private config: SessionConfig | null = null;
  private status: CompanionStatus = "IDLE";
  private history: { role: string; text: string }[] = [];

  public async connect(config: SessionConfig): Promise<void> {
    this.config = config;
    this.history = [];
    this.updateStatus("CONNECTING");

    const effectiveLang = config.language || "en";
    const patientName = config.patientName || "Friend";
    const flow = config.flowType || "routine_chat";

    // 1. Fetch opening line from backend HTTP endpoint
    try {
      console.log(`[Companion] Fetching opening line from ${COMPANION_API_URL}/api/companion/opening...`);
      const res = await fetch(
        `${COMPANION_API_URL}/api/companion/opening?user_name=${encodeURIComponent(patientName)}&flow_type=${flow}&lang=${effectiveLang}`
      );
      if (res.ok) {
        const data = await res.json();
        if (data.opening) {
          this.updateStatus("SPEAKING");
          this.history.push({ role: "assistant", text: data.opening });
          this.config?.onResponse(data.opening);
          return;
        }
      }
    } catch (err) {
      console.warn("[Companion] HTTP opening line fetch failed, using fallback:", err);
    }

    // 2. Fallback opening if backend is unreachable
    const lang = effectiveLang === "as" ? "as" : effectiveLang === "hi" ? "hi" : "en";
    const opening = FALLBACK_OPENINGS[flow]?.[lang] || FALLBACK_OPENINGS[flow]?.en;

    setTimeout(() => {
      this.updateStatus("SPEAKING");
      this.history.push({ role: "assistant", text: opening });
      this.config?.onResponse(opening, lang === "en" ? FALLBACK_OPENING_KEYS[flow] : undefined);
    }, 300);
  }

  public async sendUtterance(text: string, asrMetadata?: AsrMetadata): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;

    this.history.push({ role: "user", text: trimmed });
    this.updateStatus("THINKING");

    console.log(`[Companion] Sending utterance to backend: "${trimmed}"`);

    // Call live HTTP chat with Gemini backend
    try {
      const payload = {
        user_id: this.config?.patientId || "1",
        user_name: this.config?.patientName || "Friend",
        flow_type: this.config?.flowType || "routine_chat",
        lang: this.config?.language || "en",
        text: trimmed,
        history: this.history.slice(0, -1),
        asr_metadata: asrMetadata,
      };

      const res = await fetch(`${COMPANION_API_URL}/api/companion/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.response) {
          console.log(`[Companion] Live Gemini AI responded: "${data.response}"`);
          this.updateStatus("SPEAKING");
          this.history.push({ role: "assistant", text: data.response });
          this.config?.onResponse(data.response);
          return;
        }
      } else {
        console.warn(`[Companion] Chat endpoint returned HTTP status ${res.status}`);
      }
    } catch (err) {
      console.warn("[Companion] Live HTTP chat call error:", err);
    }

    // Offline fallback ONLY if backend HTTP is completely unreachable
    const lang = this.config?.language === "as" ? "as" : this.config?.language === "hi" ? "hi" : "en";
    const responses = FALLBACK_RESPONSES[lang] || FALLBACK_RESPONSES.en;
    const index = Math.floor(Math.random() * responses.length);
    const reply = responses[index];
    console.log(`[Companion] Using offline fallback response: "${reply}"`);
    setTimeout(() => {
      this.updateStatus("SPEAKING");
      this.history.push({ role: "assistant", text: reply });
      this.config?.onResponse(reply, lang === "en" ? `companion.fallbackResponse${index + 1}` : undefined);
    }, 400);
  }

  public endSession(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "end" }));
        this.ws.close();
      } catch (e) {
        // ignore
      }
    }
    this.ws = null;
    this.updateStatus("COMPLETED");
  }

  public disconnect(): void {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
      this.ws = null;
    }
    this.updateStatus("IDLE");
  }

  public getStatus(): CompanionStatus {
    return this.status;
  }

  private updateStatus(newStatus: CompanionStatus): void {
    this.status = newStatus;
    this.config?.onStatusChange?.(newStatus);
  }
}
