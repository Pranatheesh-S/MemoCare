import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { StatusPill } from "../src/components/StatusPill";
import { SpeakerButton } from "../src/components/SpeakerButton";
import { Illustration } from "../src/games/illustrationMap";
import { colors, role } from "../src/theme/colors";
import { MIN_TOUCH_TARGET, radius, shadow, spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { voiceManager } from "../src/audio/voiceManager";
import { useAppStore } from "../src/store/appStore";
import type { SupportedLanguage } from "@smritisetu/shared-types";
import {
  CompanionClient,
  type CompanionFlowType,
  type CompanionStatus,
} from "../src/companion/companionService";

interface QuickReply {
  id: string;
  labelKey: string;
  textEn: string;
  textAs: string;
}

const FLOW_OPTIONS: { id: CompanionFlowType; labelKey: string; icon: string }[] = [
  { id: "routine_chat", labelKey: "companion.flow.routine", icon: "SunRise" },
  { id: "memory_lane", labelKey: "companion.flow.memoryLane", icon: "PhotoFrame" },
  { id: "story_completion", labelKey: "companion.flow.story", icon: "House" },
  { id: "who_is_this", labelKey: "companion.flow.family", icon: "FamilyTogether" },
];

const QUICK_REPLIES_BY_FLOW: Record<CompanionFlowType, QuickReply[]> = {
  routine_chat: [
    {
      id: "tea",
      labelKey: "companion.quickReplies.tea",
      textEn: "I had my morning tea.",
      textAs: "মই চাহ খাই ল'লোঁ।",
    },
    {
      id: "happy",
      labelKey: "companion.quickReplies.happy",
      textEn: "I am having a good and peaceful day.",
      textAs: "আজি মোৰ দিনটো বৰ শান্তিত গৈছে।",
    },
    {
      id: "hello",
      labelKey: "companion.quickReplies.hello",
      textEn: "Hello! How are you doing today?",
      textAs: "নমস্কাৰ! আপোনাৰ আজি কেনে লাগিছে?",
    },
  ],
  memory_lane: [
    {
      id: "festival",
      labelKey: "companion.quickReplies.festival",
      textEn: "I remember celebrating Bihu and festive days in our village.",
      textAs: "মোক গাঁৱৰ বিহু আৰু উৎসৱৰ পুৰণি দিনবোৰ মনত পৰিছে।",
    },
    {
      id: "food",
      labelKey: "companion.quickReplies.tellMore",
      textEn: "My mother used to cook wonderful food for us.",
      textAs: "মোৰ মায়ে আমাৰ বাবে বৰ সোৱাদৰ খাদ্য বনাইছিল।",
    },
    {
      id: "more",
      labelKey: "companion.quickReplies.tellMore",
      textEn: "Those were such joyful and happy days.",
      textAs: "সেই দিনবোৰ বৰ আনন্দৰ আছিল।",
    },
  ],
  story_completion: [
    {
      id: "story_1",
      labelKey: "companion.quickReplies.tellMore",
      textEn: "He went to meet his friends near the ancient banyan tree.",
      textAs: "তেওঁ ডাঙৰ গছজোপাৰ তলত বন্ধুসকলক লগ কৰিবলৈ গ'ল।",
    },
    {
      id: "story_2",
      labelKey: "companion.quickReplies.tellMore",
      textEn: "Everyone gathered together and sang joyous folk songs.",
      textAs: "সকলোৱে মিলি আনন্দ মনেৰে গীত গাবলৈ ধৰিলে।",
    },
  ],
  who_is_this: [
    {
      id: "family_love",
      labelKey: "companion.quickReplies.family",
      textEn: "I love my family so much. They always take good care of me.",
      textAs: "মই মোৰ পৰিয়ালক বহুত মৰম কৰোঁ। তেওঁলোকে মোৰ যত্ন লয়।",
    },
    {
      id: "daughter",
      labelKey: "companion.quickReplies.tellMore",
      textEn: "My daughter always calls to ask how I am doing.",
      textAs: "মোৰ ছোৱালীয়ে সদায় ফোন কৰি খবৰ লয়।",
    },
  ],
};

import { audioRecorderService } from "../src/companion/audioRecorderService";
import { cheerfulWavingRobotMascot, assameseCountrysideSunriseBanner } from "../src/assets/embeddedAssets";

export default function TalkCompanionScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak } = useVoiceGuidance("companion.listening");
  const patient = useAppStore((state) => state.patient);
  const patientId = useAppStore((state) => state.patientId) ?? "1";

  const [activeFlow, setActiveFlow] = useState<CompanionFlowType>("routine_chat");
  const [companionStatus, setCompanionStatus] = useState<CompanionStatus>("IDLE");
  const [latestCompanionText, setLatestCompanionText] = useState<string>("");
  const [lastUserText, setLastUserText] = useState<string>("");
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false);
  const [speechTimerSeconds, setSpeechTimerSeconds] = useState<number>(0);
  const [textInputModalVisible, setTextInputModalVisible] = useState<boolean>(false);
  const [typedInput, setTypedInput] = useState<string>("");

  const companionClientRef = useRef<CompanionClient | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Initialize companion connection for selected flow
  const startSession = useCallback(
    (flow: CompanionFlowType) => {
      if (companionClientRef.current) {
        companionClientRef.current.disconnect();
      }

      const client = new CompanionClient();
      companionClientRef.current = client;
      setLatestCompanionText("");
      setLastUserText("");

      void client.connect({
        patientId,
        patientName: patient?.preferredName ?? "Friend",
        flowType: flow,
        language,
        onResponse: (text: string, key?: string) => {
          setLatestCompanionText(text);
          // The words appear at once; the voice follows when it is ready, so a
          // slow generation never delays what the patient can read.
          //
          // A fixed opening or offline fallback line has a bundled clip — key is
          // set — so it plays instantly instead of waiting on live generation,
          // which only genuinely one-off backend replies need.
          if (key) {
            void voiceManager.speak(key, text, {
              language: language as SupportedLanguage,
              priority: "response",
            });
          } else {
            void voiceManager.speakDynamic(text, {
              language: language as SupportedLanguage,
              priority: "response",
            });
          }
        },
        onStatusChange: (status: CompanionStatus) => {
          setCompanionStatus(status);
        },
        onSessionDone: () => {
          // Session ended cleanly
        },
        onError: (err) => {
          console.warn("[TalkCompanion] Error:", err);
        },
      });
    },
    [language, patient?.preferredName, patientId],
  );

  useEffect(() => {
    startSession(activeFlow);
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (companionClientRef.current) {
        companionClientRef.current.disconnect();
      }
      void voiceManager.stop();
    };
  }, [activeFlow, startSession]);

  const switchFlow = (flow: CompanionFlowType) => {
    if (flow === activeFlow) return;
    void voiceManager.stop();
    setActiveFlow(flow);
  };

  const handleRepeatCompanion = useCallback(() => {
    if (!latestCompanionText) return;
    void voiceManager.speakDynamic(latestCompanionText, {
      language: language as SupportedLanguage,
      force: true,
      priority: "user",
    });
  }, [language, latestCompanionText]);

  // Voice Interaction (Press & Speak -> Record -> Whisper Transcribe)
  const startListening = async () => {
    void voiceManager.stop();
    const started = await audioRecorderService.startRecording();
    if (!started) {
      console.warn("[TalkCompanion] Failed to start audio recorder");
    }
    setIsListening(true);
    setSpeechTimerSeconds(0);

    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    recordingTimerRef.current = setInterval(() => {
      setSpeechTimerSeconds((prev) => prev + 1);
    }, 1000);
  };

  const stopListeningAndSend = async () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsListening(false);
    setIsTranscribing(true);

    try {
      const result = await audioRecorderService.stopAndTranscribe(language);
      setIsTranscribing(false);

      if (result.success && result.transcript) {
        setLastUserText(result.transcript);
        companionClientRef.current?.sendUtterance(result.transcript, result.metadata);
      } else {
        // If silence or transcription had no words, offer a gentle prompt without fake words
        const noSpeechMsg = language === "as" ? "মই শুনিব নোৱাৰিলোঁ, অনুগ্ৰহ কৰি পুনৰ কওক।" : "I could not hear clearly, let us try again.";
        setLastUserText(noSpeechMsg);
        // English has a bundled clip for this exact line; Assamese still goes
        // through the dynamic path since it has no cloned-voice support.
        void (language === "as"
          ? voiceManager.speakDynamic(noSpeechMsg, { language: language as SupportedLanguage, priority: "user" })
          : voiceManager.speak("companion.noSpeechHeard", noSpeechMsg, {
              language: language as SupportedLanguage,
              priority: "user",
            }));
      }
    } catch (e) {
      setIsTranscribing(false);
      console.warn("[TalkCompanion] Error processing voice recording:", e);
    }
  };

  const handleQuickReplyPress = (reply: QuickReply) => {
    void voiceManager.stop();
    const text = language === "as" ? reply.textAs : reply.textEn;
    setLastUserText(text);
    companionClientRef.current?.sendUtterance(text, {
      audio_duration_s: 2.0,
      words_per_minute: 120,
      pause_durations_s: [0.3],
    });
  };

  const handleSendTypedMessage = () => {
    if (!typedInput.trim()) return;
    void voiceManager.stop();
    const text = typedInput.trim();
    setTypedInput("");
    setTextInputModalVisible(false);
    setLastUserText(text);
    companionClientRef.current?.sendUtterance(text);
  };

  const handleFinishChat = () => {
    companionClientRef.current?.endSession();
    void voiceManager.stop();
    router.replace("/home");
  };

  const quickReplies = useMemo(
    () => QUICK_REPLIES_BY_FLOW[activeFlow] ?? QUICK_REPLIES_BY_FLOW.routine_chat,
    [activeFlow],
  );

  return (
    <Screen
      title={t("companion.title")}
      showBack
      onBackPress={handleFinishChat}
      onHomePress={handleFinishChat}
      scrollable
      footer={
        <View style={styles.footerContainer}>
          <Button
            label={t("companion.endSession")}
            tone="secondary"
            onPress={handleFinishChat}
            testID="companion-end-button"
          />
        </View>
      }
    >
      <Image source={assameseCountrysideSunriseBanner} style={styles.backgroundImage} resizeMode="cover" />
      {/* Flow Mode Switcher Tabs */}
      <View style={styles.flowTabs}>
        {FLOW_OPTIONS.map((flow) => {
          const isSelected = flow.id === activeFlow;
          return (
            <Pressable
              key={flow.id}
              onPress={() => switchFlow(flow.id)}
              accessibilityRole="button"
              accessibilityLabel={t(flow.labelKey)}
              style={[styles.flowTab, isSelected && styles.flowTabActive]}
            >
              <Illustration id={flow.icon} size={28} />
              <Text
                variant="caption"
                weight={isSelected ? "bold" : "medium"}
                color={isSelected ? colors.deepForest : role.mutedText}
                center
              >
                {t(flow.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Companion Avatar & Breathing Glow */}
      <View style={styles.avatarSection}>
        <View
          style={[
            styles.avatarGlow,
            companionStatus === "SPEAKING" && styles.avatarGlowSpeaking,
            companionStatus === "THINKING" && styles.avatarGlowThinking,
            isListening && styles.avatarGlowListening,
          ]}
        >
          <View style={styles.avatarInner}>
            <Image source={cheerfulWavingRobotMascot} style={{ width: 140, height: 140, resizeMode: 'contain' }} />
          </View>
        </View>

        {/* Status Indicator */}
        <View style={styles.statusRow}>
          <StatusPill
            label={
              isListening
                ? `${t("companion.listening")} (${speechTimerSeconds}s)`
                : isTranscribing
                  ? (language === "as" ? "শব্দ বুজি লৈছোঁ…" : "Understanding your voice…")
                  : companionStatus === "THINKING"
                    ? t("companion.thinking")
                    : companionStatus === "SPEAKING"
                      ? t("companion.speaking")
                      : t("companion.headerSubtitle")
            }
            tone={isListening ? "offline" : isTranscribing ? "muted" : companionStatus === "SPEAKING" ? "online" : "muted"}
          />
        </View>
      </View>

      {/* Subtitle Dialogue Card */}
      <View style={styles.dialogueCard}>
        <View style={styles.dialogueHeader}>
          <Text variant="caption" weight="bold" color={colors.mediumGreen}>
            {t("companion.title")}
          </Text>
          {latestCompanionText ? (
            <SpeakerButton
              compact
              onPress={handleRepeatCompanion}
              label={t("common.repeat")}
              testID="companion-repeat-button"
            />
          ) : null}
        </View>

        <Text variant="subheading" weight="medium" style={styles.companionSpeechText}>
          {latestCompanionText || t("companion.connecting")}
        </Text>

        {lastUserText ? (
          <View style={styles.userUtteranceBlock}>
            <Text variant="caption" weight="medium" color={colors.sage}>
              {patient?.preferredName ?? "You"}:
            </Text>
            <Text variant="body" color={role.mutedText} style={styles.italicText}>
              "{lastUserText}"
            </Text>
          </View>
        ) : null}
      </View>

      {/* Primary Interaction Area: Big Mic + Quick Replies */}
      <View style={styles.interactionSection}>
        {/* Big Tap-to-Talk Microphone */}
        <Pressable
          onPress={() => {
            if (isTranscribing) return;
            if (isListening) {
              void stopListeningAndSend();
            } else {
              void startListening();
            }
          }}
          disabled={isTranscribing}
          accessibilityRole="button"
          accessibilityLabel={isListening ? t("companion.tapToStop") : t("companion.tapToSpeak")}
          style={({ pressed }) => [
            styles.micButton,
            isListening ? styles.micButtonActive : styles.micButtonIdle,
            isTranscribing && { opacity: 0.6 },
            { transform: [{ scale: pressed ? 0.95 : 1 }] },
          ]}
          testID="companion-mic-button"
        >
          <MicIcon active={isListening} />
          <Text
            variant="bodyLarge"
            weight="bold"
            color={isListening ? "#FFFFFF" : colors.deepForest}
          >
            {isTranscribing
              ? (language === "as" ? "বুজি লৈছোঁ…" : "Transcribing…")
              : isListening
                ? t("companion.tapToStop")
                : t("companion.tapToSpeak")}
          </Text>
        </Pressable>

        {/* Quick Suggestion Response Chips */}
        <View style={styles.quickRepliesSection}>
          <Text variant="caption" weight="bold" color={role.mutedText} center>
            {language === "as" ? "অথবা এটা বাছক:" : "Or choose a reply:"}
          </Text>
          <View style={styles.chipsContainer}>
            {quickReplies.map((reply) => {
              const label = language === "as" ? reply.textAs : reply.textEn;
              return (
                <Pressable
                  key={reply.id}
                  onPress={() => handleQuickReplyPress(reply)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={({ pressed }) => [
                    styles.chip,
                    { opacity: pressed ? 0.75 : 1 },
                  ]}
                >
                  <Text variant="body" weight="medium" color={colors.deepForest}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Option to open keyboard type input */}
        <Pressable
          onPress={() => setTextInputModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t("companion.typeMessage")}
          style={styles.keyboardToggle}
        >
          <KeyboardIcon />
          <Text variant="caption" weight="medium" color={colors.mediumGreen}>
            {t("companion.typeMessage")}
          </Text>
        </Pressable>
      </View>

      {/* Simple Text Input Modal Fallback */}
      <Modal
        visible={textInputModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setTextInputModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text variant="subheading" weight="bold" color={colors.deepForest}>
              {t("companion.typeMessage")}
            </Text>
            <TextInput
              value={typedInput}
              onChangeText={setTypedInput}
              placeholder={t("companion.typePlaceholder")}
              placeholderTextColor={colors.sage}
              multiline
              autoFocus
              style={styles.textInputField}
            />
            <View style={styles.modalActions}>
              <Button
                label={t("common.cancel")}
                tone="quiet"
                onPress={() => setTextInputModalVisible(false)}
                style={styles.modalBtn}
              />
              <Button
                label={t("companion.send")}
                tone="primary"
                onPress={handleSendTypedMessage}
                disabled={!typedInput.trim()}
                style={styles.modalBtn}
              />
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

function MicIcon({ active }: { active: boolean }): React.ReactElement {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none">
      <Rect
        x={9}
        y={3}
        width={6}
        height={11}
        rx={3}
        fill={active ? "#FFFFFF" : colors.deepForest}
      />
      <Path
        d="M5 10v1a7 7 0 0014 0v-1M12 18v3M8 21h8"
        stroke={active ? "#FFFFFF" : colors.deepForest}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function KeyboardIcon(): React.ReactElement {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect
        x={2}
        y={5}
        width={20}
        height={14}
        rx={3}
        stroke={colors.mediumGreen}
        strokeWidth={2}
      />
      <Path
        d="M6 10h1M10 10h1M14 10h1M18 10h1M8 14h8"
        stroke={colors.mediumGreen}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    position: "absolute",
    top: -40,
    left: -20,
    width: "120%",
    height: 400,
    opacity: 0.6,
  },
  flowTabs: {
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  flowTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFCF5",
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "transparent",
    gap: 4,
    minHeight: 68,
    ...(shadow.card as object),
  },
  flowTabActive: {
    borderColor: colors.mediumGreen,
    backgroundColor: colors.mint,
  },
  avatarSection: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  avatarGlow: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7FBF4",
    borderWidth: 3,
    borderColor: colors.sage,
    ...(shadow.card as object),
  },
  avatarGlowSpeaking: {
    borderColor: colors.mediumGreen,
    backgroundColor: colors.mint,
  },
  avatarGlowThinking: {
    borderColor: "#EAB308",
    backgroundColor: "#FEF9C3",
  },
  avatarGlowListening: {
    borderColor: "#EF4444",
    backgroundColor: "#FEE2E2",
  },
  avatarInner: {
    alignItems: "center",
    justifyContent: "center",
  },
  statusRow: {
    marginTop: spacing.xs,
  },
  dialogueCard: {
    backgroundColor: "#FFFCF5",
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
    ...(shadow.card as object),
  },
  dialogueHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  companionSpeechText: {
    color: colors.deepForest,
    lineHeight: 28,
  },
  userUtteranceBlock: {
    backgroundColor: colors.surfaceSoft,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: 4,
  },
  italicText: {
    fontStyle: "italic",
  },
  interactionSection: {
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing.xs,
  },
  micButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    width: "100%",
    minHeight: 68,
    borderRadius: 34,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    ...(shadow.raised as object),
  },
  micButtonIdle: {
    backgroundColor: colors.mint,
    borderWidth: 2,
    borderColor: colors.mediumGreen,
  },
  micButtonActive: {
    backgroundColor: "#EF4444",
    borderWidth: 2,
    borderColor: "#DC2626",
  },
  quickRepliesSection: {
    width: "100%",
    gap: spacing.sm,
  },
  chipsContainer: {
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: "#FFFCF5",
    borderRadius: 24,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: "center",
    ...(shadow.card as object),
  },
  keyboardToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  footerContainer: {
    paddingTop: spacing.xs,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.lg,
    ...(shadow.raised as object),
  },
  textInputField: {
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 18,
    color: colors.deepForest,
    minHeight: 110,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: colors.sage,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacing.md,
  },
  modalBtn: {
    flex: 1,
  },
});
