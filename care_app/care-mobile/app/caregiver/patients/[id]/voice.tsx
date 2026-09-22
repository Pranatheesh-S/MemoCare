import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { File } from "expo-file-system";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from "expo-audio";
import { Button, Card, Note } from "@/ui";
import { palette, radius, space } from "@/theme";
import { getPatient, setPatientVoiceSample } from "@/patients";
import {
  VOICE_SAMPLE_MAX_SECONDS,
  VOICE_SAMPLE_SCRIPT,
  VOICE_SAMPLE_TRANSCRIPT,
  checkVoiceSample,
  formatDuration,
} from "@/voiceScript";

// Mono, 22 kHz, 32 kbps AAC — a 60 s clip is ~240 KB, so the base64 fits
// comfortably on the Firestore patient doc (there is no Cloud Storage on Spark).
const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 32000,
};

type Phase = "idle" | "recording" | "review" | "saving";

export default function RecordVoice() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 250);

  const [phase, setPhase] = useState<Phase>("idle");
  const [name, setName] = useState("the patient");
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const maxSeenRef = useRef(0);
  const wasRecordingRef = useRef(false);

  const player = useAudioPlayer(recordedUri ? { uri: recordedUri } : null);
  const playerStatus = useAudioPlayerStatus(player);

  useEffect(() => {
    void getPatient(id).then((p) => {
      if (p) setName(p.preferredName || p.displayName || "the patient");
    });
  }, [id]);

  // Watch the poller: remember the longest duration this take (it can reset to 0
  // the instant recording stops), and when recording actually goes true -> false
  // — a manual stop, or the 60 s `forDuration` auto-stop — wrap the take up.
  useEffect(() => {
    if (recorderState.isRecording) {
      wasRecordingRef.current = true;
      maxSeenRef.current = Math.max(maxSeenRef.current, recorderState.durationMillis / 1000);
    } else if (wasRecordingRef.current && phase === "recording") {
      wasRecordingRef.current = false;
      finishTake();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorderState.isRecording, recorderState.durationMillis, phase]);

  const elapsed = phase === "recording" ? Math.min(VOICE_SAMPLE_MAX_SECONDS, recorderState.durationMillis / 1000) : 0;
  const remaining = Math.max(0, VOICE_SAMPLE_MAX_SECONDS - elapsed);

  const start = useCallback(async () => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      setRecordedUri(null);
      setRecordedSeconds(0);
      maxSeenRef.current = 0;
      wasRecordingRef.current = false;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record({ forDuration: VOICE_SAMPLE_MAX_SECONDS });
      setPhase("recording");
    } catch (e) {
      Alert.alert("Could not start recording", e instanceof Error ? e.message : "Try again.");
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      // the auto-stop may have already fired
    }
  }, [recorder]);

  function finishTake() {
    const seconds = Math.round(maxSeenRef.current || recorder.currentTime || 0);
    setRecordedSeconds(seconds);
    setRecordedUri(recorder.uri ?? null);
    setPhase("review");
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
  }

  const togglePlay = () => {
    if (playerStatus.playing) {
      player.pause();
    } else {
      if (playerStatus.didJustFinish || player.currentTime >= (player.duration || 0)) void player.seekTo(0);
      player.play();
    }
  };

  const save = async () => {
    if (!recordedUri) return;
    setPhase("saving");
    try {
      const base64 = await new File(recordedUri).base64();
      const check = checkVoiceSample(recordedSeconds, base64.length);
      if (!check.ok) {
        Alert.alert("Let's try that again", check.reason);
        setPhase("review");
        return;
      }
      await setPatientVoiceSample(id, {
        dataUri: `data:audio/m4a;base64,${base64}`,
        durationSec: recordedSeconds,
        transcript: VOICE_SAMPLE_TRANSCRIPT,
      });
      router.back();
    } catch (e) {
      Alert.alert("Could not save the recording", e instanceof Error ? e.message : "Try again.");
      setPhase("review");
    }
  };

  const redo = () => {
    player.pause();
    setRecordedUri(null);
    setRecordedSeconds(0);
    setPhase("idle");
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.paper }} edges={["bottom"]}>
      <Stack.Screen options={{ title: "" }} />
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xxl }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 }}>ASSISTANT VOICE</Text>
        <Text style={{ color: palette.ink, fontSize: 28, fontWeight: "800", letterSpacing: -0.5, marginTop: 6 }}>
          Record your voice
        </Text>
        <Text style={{ color: palette.inkSoft, fontSize: 14.5, lineHeight: 21, marginTop: 8 }}>
          {name}&rsquo;s app will speak in your voice. Read the lines below aloud, one after another, the way you would
          talk to {name} — warm, clear and unhurried. You have {VOICE_SAMPLE_MAX_SECONDS} seconds. Re-record as often as
          you like.
        </Text>

        <Note>
          Find a quiet room. Hold the phone a hand&rsquo;s width away. It is fine if you don&rsquo;t reach the last line —
          the first minute is what matters.
        </Note>

        <Card style={{ marginTop: space.md }}>
          <Text style={{ color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>
            READ THESE — {VOICE_SAMPLE_SCRIPT.length} LINES
          </Text>
          {VOICE_SAMPLE_SCRIPT.map((line, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10, marginTop: i === 0 ? space.sm : 10 }}>
              <Text style={{ color: palette.faint, fontSize: 13, fontWeight: "800", width: 18, textAlign: "right" }}>
                {i + 1}
              </Text>
              <Text style={{ color: palette.ink, fontSize: 14.5, lineHeight: 21, flex: 1 }}>{line}</Text>
            </View>
          ))}
        </Card>

        {permissionDenied ? (
          <Note tone="warn">
            Microphone access is off. Turn it on for Remi Care in your phone&rsquo;s Settings, then come back.
          </Note>
        ) : null}

        {/* Controls */}
        <View style={{ alignItems: "center", marginTop: space.xl, gap: space.md }}>
          {phase === "recording" ? (
            <>
              <Text style={{ color: palette.danger, fontSize: 40, fontWeight: "900", letterSpacing: -1 }}>
                {formatDuration(remaining)}
              </Text>
              <Text style={{ color: palette.inkSoft, fontSize: 12.5 }}>
                {remaining <= 10 ? "Nearly there — finish your line" : "Recording… read at a natural pace"}
              </Text>
              <View style={{ height: 6, width: "100%", backgroundColor: palette.line, borderRadius: 3, overflow: "hidden" }}>
                <View
                  style={{
                    height: 6,
                    width: `${(elapsed / VOICE_SAMPLE_MAX_SECONDS) * 100}%`,
                    backgroundColor: palette.danger,
                  }}
                />
              </View>
              <Pressable
                onPress={stop}
                style={{
                  marginTop: space.sm,
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  backgroundColor: palette.dangerSoft,
                  borderWidth: 3,
                  borderColor: palette.danger,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <View style={{ width: 26, height: 26, borderRadius: 5, backgroundColor: palette.danger }} />
              </Pressable>
              <Text style={{ color: palette.inkSoft, fontSize: 12 }}>Tap to stop</Text>
            </>
          ) : phase === "review" || phase === "saving" ? (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  backgroundColor: palette.successSoft,
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: radius.pill,
                }}
              >
                <Feather name="check-circle" size={15} color={palette.success} />
                <Text style={{ color: palette.success, fontWeight: "800", fontSize: 13 }}>
                  Recorded · {formatDuration(recordedSeconds)}
                </Text>
              </View>

              <Pressable
                onPress={togglePlay}
                disabled={phase === "saving"}
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: 42,
                  backgroundColor: palette.primaryTint,
                  borderWidth: 3,
                  borderColor: palette.primary,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name={playerStatus.playing ? "pause" : "play"} size={30} color={palette.primary} />
              </Pressable>
              <Text style={{ color: palette.inkSoft, fontSize: 12 }}>
                {playerStatus.playing ? "Playing…" : "Listen back"}
              </Text>

              <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm, alignSelf: "stretch" }}>
                <Button label="Record again" variant="ghost" icon="rotate-ccw" full={false} onPress={redo} />
                <Button
                  label={phase === "saving" ? "Saving…" : "Use this recording"}
                  icon="check"
                  full={false}
                  loading={phase === "saving"}
                  onPress={save}
                />
              </View>
            </>
          ) : (
            <>
              <Pressable
                onPress={start}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  backgroundColor: palette.danger,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Feather name="mic" size={38} color={palette.card} />
              </Pressable>
              <Text style={{ color: palette.inkSoft, fontSize: 13 }}>Tap to start recording</Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
