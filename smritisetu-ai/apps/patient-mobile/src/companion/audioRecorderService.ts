import {
  AudioModule,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  type AudioRecorder,
} from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { File } from "expo-file-system";
import { COMPANION_API_URL } from "../api/config";
import type { AsrMetadata } from "./companionService";

export interface TranscriptionResult {
  success: boolean;
  transcript: string;
  metadata: AsrMetadata;
  error?: string;
}

let activeRecorder: AudioRecorder | null = null;
let recordingStartTime = 0;

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let base64 = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const c1 = b1 >> 2;
    const c2 = ((b1 & 3) << 4) | (b2 >> 4);
    const c3 = ((b2 & 15) << 2) | (b3 >> 6);
    const c4 = b3 & 63;

    base64 += chars[c1] + chars[c2];
    base64 += i + 1 < len ? chars[c3] : "=";
    base64 += i + 2 < len ? chars[c4] : "=";
  }
  return base64;
}

async function readAudioAsBase64(audioUri: string): Promise<string> {
  // Method 1: Try expo-file-system/legacy
  try {
    const legacyBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    if (legacyBase64 && legacyBase64.length > 0) {
      return legacyBase64;
    }
  } catch (e) {
    console.log("[AudioRecorder] Legacy file reader note:", e);
  }

  // Method 2: Try new File class from expo-file-system
  try {
    const file = new File(audioUri);
    const arrayBuf = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuf);
    return uint8ArrayToBase64(bytes);
  } catch (e) {
    console.log("[AudioRecorder] New File API reader note:", e);
  }

  throw new Error("Unable to read audio file contents");
}

export const audioRecorderService = {
  async ensurePermission(): Promise<boolean> {
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      return granted;
    } catch (e) {
      console.warn("[AudioRecorder] Failed to request permissions:", e);
      return false;
    }
  },

  async startRecording(): Promise<boolean> {
    try {
      const hasPermission = await this.ensurePermission();
      if (!hasPermission) {
        console.warn("[AudioRecorder] Microphone permission not granted");
        return false;
      }

      // Configure audio session for recording
      try {
        await setAudioModeAsync({
          allowsRecording: true,
          playsInSilentMode: true,
        });
      } catch (modeErr) {
        console.warn("[AudioRecorder] setAudioModeAsync error:", modeErr);
      }

      if (activeRecorder) {
        try {
          await activeRecorder.stop();
        } catch {
          // ignore
        }
        activeRecorder = null;
      }

      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      activeRecorder = recorder;
      recordingStartTime = Date.now();
      console.log("[AudioRecorder] Recording started...");
      return true;
    } catch (e) {
      console.error("[AudioRecorder] Failed to start recording:", e);
      return false;
    }
  },

  async stopAndTranscribe(language: string = "en"): Promise<TranscriptionResult> {
    if (!activeRecorder) {
      return {
        success: false,
        transcript: "",
        metadata: {
          audio_duration_s: 0,
          words_per_minute: 0,
          pause_durations_s: [],
        },
        error: "No active recording",
      };
    }

    const elapsedSeconds = Math.max(1, (Date.now() - recordingStartTime) / 1000);
    let audioUri: string | null = null;

    try {
      await activeRecorder.stop();
      audioUri = activeRecorder.uri;
      activeRecorder = null;
      console.log("[AudioRecorder] Recording stopped, uri:", audioUri, "duration:", elapsedSeconds);
    } catch (e) {
      console.warn("[AudioRecorder] Error stopping recorder:", e);
      activeRecorder = null;
    }

    // Reset audio mode to playback
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });
    } catch {
      // ignore
    }

    if (!audioUri) {
      return {
        success: false,
        transcript: "",
        metadata: {
          audio_duration_s: elapsedSeconds,
          words_per_minute: 0,
          pause_durations_s: [0.3],
        },
        error: "No audio file produced",
      };
    }

    // Upload audio file to backend /api/transcribe/base64 endpoint
    try {
      console.log(`[AudioRecorder] Reading audio file as Base64: ${audioUri}...`);
      const base64Audio = await readAudioAsBase64(audioUri);

      const uploadUrl = `${COMPANION_API_URL}/api/transcribe/base64`;
      console.log(`[AudioRecorder] Uploading Base64 audio (${base64Audio.length} chars) to ${uploadUrl}...`);

      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          audio_base64: base64Audio,
          format: "m4a",
          lang: language,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      console.log("[AudioRecorder] Transcription result:", data);
      const transcript = (data.transcript || "").trim();

      return {
        success: true,
        transcript,
        metadata: {
          audio_duration_s: data.audio_duration_s ?? elapsedSeconds,
          words_per_minute: data.words_per_minute ?? 0,
          pause_durations_s: data.pause_durations_s ?? [0.4],
        },
      };
    } catch (err) {
      console.warn("[AudioRecorder] Transcription upload error:", err);
      return {
        success: false,
        transcript: "",
        metadata: {
          audio_duration_s: elapsedSeconds,
          words_per_minute: 0,
          pause_durations_s: [0.3],
        },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  isRecording(): boolean {
    return activeRecorder !== null;
  },
};
