import React, { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { Illustration } from "../../src/games/illustrationMap";
import { colors, role } from "../../src/theme/colors";
import { radius, shadow, spacing } from "../../src/theme/tokens";
import { useTranslation } from "../../src/i18n/useTranslation";
import { useVoiceGuidance } from "../../src/audio/useVoiceGuidance";
import { voiceManager } from "../../src/audio/voiceManager";
import { useAppStore } from "../../src/store/appStore";
import { useGameSession } from "../../src/games/useGameSession";
import { MemoryRepository, type CachedMemory } from "../../src/db/repositories/memoryRepository";
import * as lane from "../../src/games/logic/memoryLane";
import { composeGuidedPrompt } from "../../src/games/memoryLanePrompt";
import { GameFade } from "../../src/games/GameFeel";
import { son, settingsIcon, daughter, grandson, leafSprig, portraitCutout, floralCornerBouquet, asha, pinkFlowerSprig, festival, home, patient, river, teaGarden, wedding, jorhatHouse } from "../../src/assets/embeddedAssets";

const getFallbackImage = (title?: string, name?: string) => {
  const n = (title + " " + name)?.toLowerCase() ?? "";
  if (n.includes("wedding")) return wedding;
  if (n.includes("jorhat")) return jorhatHouse;
  if (n.includes("festival") || n.includes("bihu")) return festival;
  if (n.includes("home") || n.includes("house")) return home;
  if (n.includes("river") || n.includes("brahmaputra")) return river;
  if (n.includes("tea")) return teaGarden;
  if (n.includes("patient")) return patient;
  if (n.includes("asha") || n.includes("wife")) return asha;
  if (n.includes("daughter") || n.includes("nabanita")) return daughter;
  if (n.includes("grandson") || n.includes("rishav")) return grandson;
  if (n.includes("son") || n.includes("bhaskar")) return son;
  return portraitCutout;
};

const pinkFlower = pinkFlowerSprig;
const floralCorner = floralCornerBouquet;

/**
 * Memory Lane.
 *
 * A calm reminiscence activity with no score, no timer, no right answer and no
 * way to do it wrong. Only engagement is recorded, and leaving is never treated
 * as abandonment.
 */
export default function MemoryLaneScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("memoryLane.instruction");
  const patientId = useAppStore((state) => state.patientId);
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const { recordSession } = useGameSession("MEMORY_LANE");

  const [state, setState] = useState<lane.MemoryLaneState | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [assets, setAssets] = useState<CachedMemory[] | null>(null);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      const memories = await new MemoryRepository().listByCategory(patientId);
      setAssets(memories);
      setState(lane.createSession(memories));
    })();
  }, [patientId]);

  const current = state ? lane.currentAsset(state) : null;
  const prompt = current ? composeGuidedPrompt(current, language) : null;

  useEffect(() => {
    if (!prompt) return;
    void speak(prompt.key, prompt.params);
  }, [prompt?.params.name, prompt?.params.relationshipClause, prompt?.params.sceneClause, speak]);

  const save = useCallback(
    async (finalState: lane.MemoryLaneState) => {
      const metrics = lane.toSessionMetrics(finalState);
      await recordSession(
        {
          accuracy: metrics.accuracy,
          responseTimeSeconds: metrics.responseTimeSeconds,
          hintsUsed: metrics.hintsUsed,
          attempts: metrics.attempts,
          completed: metrics.completed,
          abandoned: metrics.abandoned,
          engagementDurationSeconds: metrics.engagementDurationSeconds,
        },
        metrics.detail,
      );
    },
    [recordSession],
  );

  const leave = useCallback(
    async (voluntary: boolean) => {
      if (state) await save(voluntary ? lane.markVoluntaryCompletion(state) : state);
      await voiceManager.stop();
      router.replace("/games");
    },
    [router, save, state],
  );

  const playAudio = useCallback(async () => {
    if (!current || !state) return;
    const uri = current.voiceLocalPath ?? current.voiceUrl ?? current.localPath ?? current.mediaUrl;
    if (!uri || current.assetType !== "AUDIO") {
      // No clip: read the story aloud instead, which still works offline.
      const story = language === "as" ? current.storyAs : current.storyEn;
      if (story) await voiceManager.speakDynamic(story, { language, priority: "user" });
    } else {
      await voiceManager.playClip(uri);
    }
    setAudioPlaying(true);
    setState((s) => (s ? lane.recordAudioPlayed(s) : s));
  }, [current, language, state]);

  const stopAudio = useCallback(async () => {
    await voiceManager.stop();
    setAudioPlaying(false);
  }, []);

  if (assets && assets.length === 0) {
    return (
      <Screen title={t("games.memoryLane")} showBack>
        <EmptyState
          title={t("memories.empty")}
          message={t("errors.noMemories")}
          illustration={<Illustration id="PhotoFrame" size={90} />}
          actionLabel={t("common.goHome")}
          onAction={() => router.replace("/games")}
        />
      </Screen>
    );
  }

  if (!state || !current) {
    return (
      <Screen title={t("games.memoryLane")} showBack>
        <Text variant="bodyLarge" center>
          {t("common.loading")}
        </Text>
      </Screen>
    );
  }

  const title = language === "as" && current.titleAs ? current.titleAs : current.titleEn;
  const caption = language === "as" ? current.captionAs : current.captionEn;
  const story = language === "as" ? current.storyAs : current.storyEn;
  const imageUri = current.localPath ?? current.mediaUrl;

  return (
    <Screen
      title={t("games.memoryLane")}
      onRepeat={repeat}
      showBack
      onBackPress={() => void leave(false)}
      onHomePress={() => void leave(false)}
      scrollable
      footer={
        <View style={styles.footer}>
          {/* We moved the navigation buttons into the main view, and removed the finish button to match the design (Home/Back are in the header) */}
        </View>
      }
    >
      <GameFade reducedMotion={reducedMotion}>
        <View style={styles.contentContainer}>
          <View style={styles.imageCard}>
            {current.assetType === "PHOTO" && imageUri ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="cover"
                accessibilityLabel={title}
                onError={() => {
                  void new MemoryRepository().markUnavailable(current.memoryId);
                  setState((s) => (s ? lane.next(s) : s));
                }}
              />
            ) : (
              <Image
                source={getFallbackImage(title, current.personName)}
                style={styles.image}
                resizeMode="cover"
                accessibilityLabel={title}
              />
            )}
          </View>

          <View style={styles.navRow}>
            <Button
              label={t("common.previous")}
              tone="quiet"
              onPress={() => setState((s) => (s ? lane.previous(s) : s))}
              disabled={!lane.hasPrevious(state)}
              style={[styles.navButton, { backgroundColor: "#F9F8F1", borderColor: "#E3DAC0", borderWidth: 1 }]}
            />
            <Button
              label={t("common.next")}
              tone="primary"
              onPress={() => setState((s) => (s ? lane.next(s) : s))}
              disabled={!lane.hasNext(state)}
              style={styles.navButton}
            />
          </View>

          <View style={styles.textCard}>
            <Image source={pinkFlower} style={styles.cardDecoTopLeft} />
            <Image source={floralCorner} style={styles.cardDecoBottomRight} />
            <Image source={leafSprig} style={styles.cardDecoBottomCenter} />
            
            <View style={styles.textBlock}>
              {prompt ? (
                <Text variant="bodyLarge" weight="bold" color="#0D2C1E" center>
                  {t(prompt.key, prompt.params)}
                </Text>
              ) : null}
              <Text variant="subheading" weight="bold" color="#0D2C1E" center>
                {title}
              </Text>
              {caption ? (
                <Text variant="body" color={role.mutedText} center>
                  {caption}
                </Text>
              ) : null}
              {story ? (
                <Text variant="bodyLarge" weight="bold" color="#0D2C1E" center>
                  {story}
                </Text>
              ) : null}
            </View>

            <Pressable 
              style={styles.settingsButton}
              onPress={() => {
                /* Add settings navigation if needed */
              }}
              accessibilityLabel={t("common.settings")}
              accessibilityRole="button"
            >
              <Image source={settingsIcon} style={styles.settingsIcon} />
            </Pressable>
          </View>

          <View style={styles.audioRow}>
            <Button
              label={audioPlaying ? t("common.pause") : t("common.play")}
              tone="quiet"
              onPress={() => void (audioPlaying ? stopAudio() : playAudio())}
              style={[styles.audioButton, { backgroundColor: "#F9F8F1", borderColor: "#E3DAC0", borderWidth: 1 }]}
            />
          </View>

          <Text variant="caption" color={role.mutedText} center style={{ marginBottom: spacing.xl }}>
            {state.index + 1} / {state.assets.length}
          </Text>
        </View>
      </GameFade>
    </Screen>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    gap: spacing.lg,
  },
  imageCard: {
    alignItems: "center",
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl + 4,
    padding: 8,
    ...(shadow.card as object),
    elevation: 4,
  },
  image: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1.1,
    borderRadius: radius.xl,
  },
  imageFallback: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1.1,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  textCard: {
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    padding: spacing.xl,
    position: "relative",
    ...(shadow.card as object),
    elevation: 3,
    minHeight: 120,
    justifyContent: "center",
    marginHorizontal: spacing.sm,
  },
  textBlock: {
    gap: spacing.sm,
    zIndex: 1,
  },
  cardDecoTopLeft: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 50,
    height: 50,
    resizeMode: "contain",
    zIndex: 0,
  },
  cardDecoBottomRight: {
    position: "absolute",
    bottom: -10,
    right: -10,
    width: 60,
    height: 60,
    resizeMode: "contain",
    zIndex: 0,
  },
  cardDecoBottomCenter: {
    position: "absolute",
    bottom: -15,
    alignSelf: "center",
    width: 40,
    height: 20,
    resizeMode: "contain",
    zIndex: 0,
  },
  settingsButton: {
    position: "absolute",
    bottom: -15,
    right: -15,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#0D2C1E",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    ...(shadow.card as object),
    zIndex: 10,
  },
  settingsIcon: {
    width: 24,
    height: 24,
    resizeMode: "contain",
    tintColor: "#FFFFFF",
  },
  audioRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.md,
    justifyContent: "center",
  },
  audioButton: {
    maxWidth: 200,
  },
  footer: {
    gap: spacing.md,
  },
  navRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  navButton: {
    flex: 1,
  },
});
