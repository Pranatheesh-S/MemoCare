import React, { useCallback, useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Screen } from "../src/components/Screen";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { SpeakerButton } from "../src/components/SpeakerButton";
import { EmptyState } from "../src/components/EmptyState";
import { Illustration } from "../src/games/illustrationMap";
import { colors, role } from "../src/theme/colors";
import { MIN_TOUCH_TARGET, radius, shadow, spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { voiceManager } from "../src/audio/voiceManager";
import { useAppStore } from "../src/store/appStore";
import { MemoryRepository, type CachedMemory } from "../src/db/repositories/memoryRepository";
import { eventQueue } from "../src/sync/eventQueue";
import type { MemoryCategory } from "@smritisetu/shared-types";
import { glossyHeartMemoriesPhotoStack } from "../src/assets/embeddedAssets";
import { resolveMemoryImage, resolveMemoryAudio } from "../src/utils/imageResolver";
import { audioService } from "../src/audio/audioService";
import { buildLocalDemoPackage } from "../src/session/localDemoPackage";

import {
  heroBanner,
  familyCard,
  homeCard,
  festivalsCard,
  placesCard,
  songsCard,
  happyMomentsCard,
  floralCornerMemories,
  leafSprigMemories
} from "../src/assets/myMemoriesAssets";

const CATEGORIES: Array<{ id: MemoryCategory; image: any }> = [
  { id: "MY_FAMILY", image: familyCard },
  { id: "MY_HOME", image: homeCard },
  { id: "MY_FESTIVALS", image: festivalsCard },
  { id: "MY_PLACES", image: placesCard },
  { id: "MY_SONGS", image: songsCard },
  { id: "HAPPY_MOMENTS", image: happyMomentsCard },
];

/**
 * My Memories.
 *
 * Two steps only: pick a category, then look through it with Previous and Next.
 * Everything shown comes from the device's consented cache, so it works with no
 * network, and a missing file shows a friendly card rather than a broken image.
 */
export default function MyMemoriesScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { repeat } = useVoiceGuidance("memories.title");
  const patientId = useAppStore((state) => state.patientId);
  const deviceId = useAppStore((state) => state.deviceId);

  const [category, setCategory] = useState<MemoryCategory | null>(null);
  const [memories, setMemories] = useState<CachedMemory[]>([]);
  const [index, setIndex] = useState(0);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [viewed, setViewed] = useState<string[]>([]);
  const [audioPlayed, setAudioPlayed] = useState(0);
  const [startedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      const repo = new MemoryRepository();
      let count = await repo.count(patientId);
      if (count === 0) {
        const demo = buildLocalDemoPackage();
        await repo.replaceAll(
          patientId,
          demo.memories.map((m) => ({ ...m, patientId })),
        );
        count = await repo.count(patientId);
      }
      setTotalCount(count);
    })();
  }, [patientId]);

  // Record engagement when leaving, so the caregiver sees time spent with
  // memories — never a score.
  useEffect(
    () => () => {
      if (!patientId || !deviceId || viewed.length === 0) return;
      void eventQueue.recordMemoryEngagement({
        patientId,
        deviceId,
        memoryIds: viewed,
        audioPlayedCount: audioPlayed,
        engagementDurationSeconds: Math.round((Date.now() - startedAt) / 1000),
      });
    },
    [audioPlayed, deviceId, patientId, startedAt, viewed],
  );

  const [playState, setPlayState] = useState<"PLAYING" | "PAUSED" | "STOPPED">("STOPPED");

  useEffect(() => {
    return () => {
      void audioService.stop();
      setPlayState("STOPPED");
    };
  }, [category, index]);

  const openCategory = useCallback(
    async (selected: MemoryCategory) => {
      if (!patientId) return;
      void audioService.stop();
      setPlayState("STOPPED");
      const repo = new MemoryRepository();
      let list = await repo.listByCategory(patientId, selected);

      // If the category in SQLite is empty, populate from default demo package
      if (list.length === 0) {
        const demoMemories = buildLocalDemoPackage()
          .memories.filter((m) => m.category === selected)
          .map((m) => ({ ...m, patientId }));

        if (demoMemories.length > 0) {
          for (const m of demoMemories) {
            await repo.upsert(m as CachedMemory);
          }
          list = await repo.listByCategory(patientId, selected);
          if (list.length === 0) {
            list = demoMemories as unknown as CachedMemory[];
          }
        }
      }

      setMemories(list);
      setCategory(selected);
      setIndex(0);
      if (list[0]) setViewed((current) => [...new Set([...current, list[0].memoryId])]);
    },
    [patientId],
  );

  const move = useCallback(
    (delta: number) => {
      void audioService.stop();
      setPlayState("STOPPED");
      setIndex((current) => {
        const next = Math.max(0, Math.min(current + delta, memories.length - 1));
        const memory = memories[next];
        if (memory) setViewed((v) => [...new Set([...v, memory.memoryId])]);
        return next;
      });
    },
    [memories],
  );

  if (!category) {
    return (
      <Screen title={t("memories.title")} onRepeat={repeat} showBack scrollable>
        {totalCount === 0 ? (
          <EmptyState
            title={t("memories.empty")}
            message={t("errors.noMemories")}
            illustration={<Image source={glossyHeartMemoriesPhotoStack} style={{ width: 100, height: 100 }} />}
            actionLabel={t("common.goHome")}
            onAction={() => router.replace("/home")}
          />
        ) : (
          <View style={{ flex: 1, paddingBottom: 60 }}>
            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
               <Image source={heroBanner} style={styles.heroBannerImage} />
            </View>
            <View style={styles.categoryGrid}>
            {CATEGORIES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => void openCategory(item.id)}
                accessibilityRole="button"
                accessibilityLabel={t(`memories.category.${item.id}`)}
                style={({ pressed }) => [
                  styles.categoryCard,
                  { opacity: pressed ? 0.88 : 1 },
                ]}
              >
                <View style={styles.cardImageContainer}>
                  <Image source={item.image} style={styles.cardImage} />
                </View>
                <Text variant="bodyLarge" weight="bold" color="#0D2C1E" center>
                  {t(`memories.category.${item.id}`)}
                </Text>
              </Pressable>
            ))}
            </View>
            
            {/* Custom Bottom Decorators overlaying the ScrollView content */}
            <View pointerEvents="none" style={styles.decoBottomLeft}>
              <Image source={floralCornerMemories} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </View>
            <View pointerEvents="none" style={styles.decoBottomRight}>
              <Image source={leafSprigMemories} style={StyleSheet.absoluteFill} resizeMode="contain" />
            </View>
          </View>
        )}
      </Screen>
    );
  }

  const current = memories[index];

  if (!current) {
    return (
      <Screen
        title={t(`memories.category.${category}`)}
        showBack
        onBackPress={() => setCategory(null)}
      >
        <EmptyState
          title={t("memories.empty")}
          illustration={<Illustration id="PhotoFrame" size={90} />}
          actionLabel={t("common.back")}
          onAction={() => setCategory(null)}
        />
      </Screen>
    );
  }

  const title = language === "as" && current.titleAs ? current.titleAs : current.titleEn;
  const caption = language === "as" ? current.captionAs : current.captionEn;
  const imageSource = resolveMemoryImage(current);
  const audioSource = resolveMemoryAudio(current);

  const startAudio = async () => {
    if (audioSource) {
      setPlayState("PLAYING");
      if (typeof audioSource === "number") {
        await audioService.play(
          { kind: "asset", source: audioSource, language },
          { onFinished: () => setPlayState("STOPPED") },
        );
      } else {
        await audioService.play(
          { kind: "recording", uri: audioSource, language },
          { onFinished: () => setPlayState("STOPPED") },
        );
      }
      setAudioPlayed((count) => count + 1);
    } else {
      setPlayState("PLAYING");
      const text = caption ?? title;
      await voiceManager.speakDynamic(text, { language, priority: "user" });
      setAudioPlayed((count) => count + 1);
      setPlayState("STOPPED");
    }
  };

  const pauseAudio = async () => {
    await audioService.pause();
    setPlayState("PAUSED");
  };

  const resumeAudio = async () => {
    await audioService.resume();
    setPlayState("PLAYING");
  };

  const stopAudio = async () => {
    await audioService.stop();
    setPlayState("STOPPED");
  };

  const togglePlayPause = async () => {
    if (playState === "PLAYING") {
      await pauseAudio();
    } else if (playState === "PAUSED") {
      await resumeAudio();
    } else {
      await startAudio();
    }
  };

  return (
    <Screen
      title={t(`memories.category.${category}`)}
      showBack
      onBackPress={() => {
        void audioService.stop();
        setPlayState("STOPPED");
        setCategory(null);
      }}
      footer={
        <View style={styles.navRow}>
          <Button
            label={t("common.previous")}
            tone="quiet"
            onPress={() => move(-1)}
            disabled={index === 0}
            style={styles.navButton}
          />
          <Button
            label={t("common.next")}
            onPress={() => move(1)}
            disabled={index >= memories.length - 1}
            style={styles.navButton}
          />
        </View>
      }
    >
      <View style={styles.imageWrapper}>
        {imageSource && current.available ? (
          <Image
            source={imageSource}
            style={styles.image}
            resizeMode="cover"
            accessibilityLabel={title}
            onError={() => void new MemoryRepository().markUnavailable(current.memoryId)}
          />
        ) : (
          <View style={styles.imageFallback}>
            {current.assetType === "AUDIO" ? (
              <Illustration id="Dhol" size={100} />
            ) : (
              <>
                <View style={styles.pendingIconCircle}>
                  <Illustration id="PhotoFrame" size={56} />
                </View>
                <Text variant="subheading" weight="bold" color="#0D2C1E" center>
                  {t("memories.uploadPending")}
                </Text>
                <Text variant="caption" color={role.mutedText} center style={{ paddingHorizontal: spacing.sm }}>
                  {t("memories.uploadPendingNotice")}
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {/* Dedicated prominent Music Player Card for Songs */}
      {current.assetType === "AUDIO" || category === "MY_SONGS" ? (
        <View style={styles.musicPlayerCard}>
          {playState === "STOPPED" ? (
            <Pressable
              onPress={() => void togglePlayPause()}
              style={({ pressed }) => [
                styles.musicPlayButton,
                { opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("common.play")}
            >
              <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
                <Path d="M8 5v14l11-7z" fill="#FFFFFF" />
              </Svg>
              <Text variant="heading" weight="bold" color="#FFFFFF">
                {language === "as" ? "গান বজাওক (Play Song)" : "Play Song"}
              </Text>
            </Pressable>
          ) : (
            <View style={styles.musicDualControlsRow}>
              <Pressable
                onPress={() => void togglePlayPause()}
                style={({ pressed }) => [
                  styles.musicDualButton,
                  playState === "PLAYING" ? styles.musicPauseButton : styles.musicResumeButton,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={playState === "PLAYING" ? t("common.pause") : t("common.play")}
              >
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                  {playState === "PLAYING" ? (
                    <>
                      <Path d="M6 4h4v16H6z" fill="#FFFFFF" />
                      <Path d="M14 4h4v16h-4z" fill="#FFFFFF" />
                    </>
                  ) : (
                    <Path d="M8 5v14l11-7z" fill="#FFFFFF" />
                  )}
                </Svg>
                <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
                  {playState === "PLAYING"
                    ? language === "as"
                      ? "ৰখাওক (Pause)"
                      : "Pause"
                    : language === "as"
                      ? "আকৌ বজাওক"
                      : "Resume"}
                </Text>
              </Pressable>

              <Pressable
                onPress={() => void stopAudio()}
                style={({ pressed }) => [
                  styles.musicDualButton,
                  styles.musicStopButton,
                  { opacity: pressed ? 0.85 : 1 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("common.stop")}
              >
                <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
                  <Path d="M6 6h12v12H6z" fill="#FFFFFF" />
                </Svg>
                <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
                  {language === "as" ? "বন্ধ কৰক (Stop)" : "Stop"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      <View style={styles.captionRow}>
        <View style={styles.captionText}>
          <Text variant="subheading" weight="bold">
            {title}
          </Text>
          {caption ? (
            <Text variant="body" color={role.mutedText}>
              {caption}
            </Text>
          ) : null}
        </View>
        <SpeakerButton
          compact
          onPress={() => void togglePlayPause()}
          label={
            playState === "PLAYING"
              ? t("common.pause")
              : playState === "PAUSED"
                ? t("common.play")
                : current.assetType === "AUDIO" || category === "MY_SONGS"
                  ? t("common.play")
                  : t("common.listen")
          }
        />
      </View>

      <View style={styles.actionRow}>
        <Button
          label={current.favourite ? t("memories.removeFavourite") : t("memories.addFavourite")}
          tone="secondary"
          onPress={() =>
            void (async () => {
              const next = await new MemoryRepository().toggleFavourite(current.memoryId);
              setMemories((list) =>
                list.map((m) => (m.memoryId === current.memoryId ? { ...m, favourite: next } : m)),
              );
            })()
          }
        />
      </View>

      <Text variant="caption" color={role.mutedText} center>
        {index + 1} / {memories.length}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  categoryCard: {
    width: "48%", 
    aspectRatio: 1.1,
    borderRadius: 24,
    backgroundColor: "#FDF8ED",
    alignItems: "center",
    justifyContent: "space-between",
    padding: spacing.md,
    ...(shadow.card as object),
    elevation: 4,
  },
  cardImageContainer: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  cardImage: {
    width: "110%",
    height: "110%",
    resizeMode: "contain",
  },
  heroBannerImage: {
    width: "100%",
    height: 180,
    resizeMode: "cover",
    borderRadius: 24,
    ...(shadow.card as object),
    elevation: 3,
  },
  decoBottomLeft: {
    position: "absolute",
    bottom: -60,
    left: -20,
    width: 100,
    height: 100,
    resizeMode: "contain",
  },
  decoBottomRight: {
    position: "absolute",
    bottom: -60,
    right: -20,
    width: 100,
    height: 100,
    resizeMode: "contain",
  },
  imageWrapper: {
    alignItems: "center",
  },
  musicPlayerCard: {
    marginVertical: spacing.xs,
  },
  musicPlayButton: {
    backgroundColor: "#1A4331",
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    minHeight: 56,
    ...(shadow.card as object),
    elevation: 3,
  },
  musicPlayButtonActive: {
    backgroundColor: "#235347",
  },
  musicDualControlsRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  musicDualButton: {
    flex: 1,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minHeight: 52,
    ...(shadow.card as object),
    elevation: 3,
  },
  musicPauseButton: {
    backgroundColor: "#235347",
    borderWidth: 1.5,
    borderColor: "#8EB69B",
  },
  musicResumeButton: {
    backgroundColor: "#1A4331",
  },
  musicStopButton: {
    backgroundColor: "#D33A31",
  },
  image: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1.1,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.sage,
    ...(shadow.card as object),
  },
  imageFallback: {
    width: "100%",
    maxWidth: 320,
    aspectRatio: 1.1,
    borderRadius: 24,
    backgroundColor: "#F7FBF4",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: "#E3ECE0",
    borderStyle: "dashed",
  },
  pendingIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E8F3E5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xs,
  },
  captionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
  },
  captionText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs,
  },
  actionRow: {
    gap: spacing.md,
  },
  navRow: {
    flexDirection: "row",
    gap: spacing.md,
  },
  navButton: {
    flex: 1,
  },
});
