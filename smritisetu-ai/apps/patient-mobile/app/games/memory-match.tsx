import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View, Image } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Illustration } from "../../src/games/illustrationMap";
import { colors, role } from "../../src/theme/colors";
import { motion, radius, shadow, spacing } from "../../src/theme/tokens";
import { useTranslation } from "../../src/i18n/useTranslation";
import { useVoiceGuidance } from "../../src/audio/useVoiceGuidance";
import { useAppStore } from "../../src/store/appStore";
import { useGameSession } from "../../src/games/useGameSession";
import * as game from "../../src/games/logic/memoryMatch";
import type { MatchCard } from "../../src/games/gameContent";
import { resolveContentPack } from "../../src/content";
import { GameFade, RoundCompleteMoment } from "../../src/games/GameFeel";
import { bounceScale, hapticComplete, hapticMatch } from "../../src/games/feel";
import {
  floralCornerBouquet,
  cardBackTile,
  progressStarBadge,
  leafSprigDecoration,
  smallFlowerIcon,
  teaLeaves,
  bambooBasket,
  gamosa,
  pitha,
  kopouFlower,
  dhol,
  waterPot,
  jaapi,
  xorai,
  glassOfWater,
} from "../../src/assets/memoryMatchAssets";

const getObjectImage = (id: string) => {
  switch (id) {
    case "tea": return teaLeaves;
    case "basket": return bambooBasket;
    case "gamosa": return gamosa;
    case "pitha": return pitha;
    case "kopou": return kopouFlower;
    case "dhol": return dhol;
    case "pot": return waterPot;
    case "jaapi": return jaapi;
    case "xorai": return xorai;
    case "glass": return glassOfWater;
    default: return smallFlowerIcon;
  }
};

const MISMATCH_VISIBLE_MS = 1400;
const HINT_VISIBLE_MS = 2200;

/**
 * Memory Match
 *
 * Classic memory game where you flip pairs of matching cards.
 */
export default function MemoryMatchScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak } = useVoiceGuidance("memoryMatch.instruction");
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const stateId = useAppStore((state) => state.stateId);
  const communityId = useAppStore((state) => state.communityId);
  const pack = useMemo(() => resolveContentPack(stateId, communityId), [stateId, communityId]);
  const { config, recordSession, resetRecording } = useGameSession("MEMORY_MATCH");

  const [state, setState] = useState<game.MemoryMatchState | null>(null);
  const [message, setMessage] = useState<string>("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [finished, setFinished] = useState(false);
  const [previewLeft, setPreviewLeft] = useState(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(
    (mode: "fresh" | "next" = "fresh") => {
      resetRecording();
      const fresh = game.createGame(
        config.difficulty,
        config.hintsAllowed,
        undefined,
        undefined,
        pack,
        Math.max(8, config.itemCount ?? 8),
      );
      setState(fresh);
      setFinished(false);
      setPreviewLeft(config.previewSeconds);
      if (mode === "next") {
        setMessage(t("memoryMatch.nextRound"));
        void speak("memoryMatch.nextRound");
      } else {
        setMessage(t("memoryMatch.preview"));
        void speak("memoryMatch.preview");
      }
    },
    [
      config.difficulty,
      config.hintsAllowed,
      config.itemCount,
      config.previewSeconds,
      pack,
      resetRecording,
      speak,
      t,
    ],
  );

  useEffect(() => {
    if (config.loaded && !state) start();
  }, [config.loaded, start, state]);

  // Preview countdown. This is not a scoring timer — nothing is lost when it
  // ends, the cards simply turn over.
  useEffect(() => {
    if (!state?.previewing || previewLeft <= 0) return;
    const timer = setTimeout(() => setPreviewLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [previewLeft, state?.previewing]);

  useEffect(() => {
    if (state?.previewing && previewLeft === 0) {
      setState((current) => (current ? game.endPreview(current) : current));
      setMessage(t("memoryMatch.instruction"));
      void speak("memoryMatch.instruction");
    }
  }, [previewLeft, speak, state?.previewing, t]);

  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const onCardPress = useCallback(
    (card: MatchCard) => {
      setState((current) => {
        if (!current) return current;
        const result = game.flipCard(current, card.cardId);

        if (result.outcome === "MATCH") {
          hapticMatch(reducedMotion);
          setMessage(
            t("memoryMatch.matched", {
              count: result.state.matchedPairs,
              total: result.state.totalPairs,
            }),
          );
          const progressKey = `memoryMatch.matched${result.state.matchedPairs}of${result.state.totalPairs}`;
          const hasProgressClip = result.state.totalPairs <= 6;
          void speak(hasProgressClip ? progressKey : "memoryMatch.matched", {
            count: result.state.matchedPairs,
            total: result.state.totalPairs,
          });
        } else if (result.outcome === "NO_MATCH") {
          setMessage(t("memoryMatch.tryAnother"));
          void speak("memoryMatch.tryAnother");
          setTimeout(() => setState((s) => (s ? game.resolveMismatch(s) : s)), MISMATCH_VISIBLE_MS);
        } else if (result.outcome === "COMPLETED") {
          hapticComplete(reducedMotion);
          setMessage(t("games.wellDone"));
          void speak("games.wellDone");
          void finish(result.state, true);
        }

        return result.state;
      });
    },
    // finish is stable for the lifetime of the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reducedMotion, speak, t],
  );

  const onHint = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const { state: hinted, revealed } = game.useHint(current);
      if (revealed.length === 0) return current;

      void speak("games.tryTogether");
      setMessage(t("games.tryTogether"));
      hintTimer.current = setTimeout(() => {
        setState((s) => (s ? game.hideHint(s, revealed) : s));
      }, HINT_VISIBLE_MS);

      return hinted;
    });
  }, [speak, t]);

  const finish = useCallback(
    async (finalState: game.MemoryMatchState, completed: boolean) => {
      setFinished(true);
      await recordSession(
        {
          accuracy: game.computeAccuracy(finalState),
          responseTimeSeconds: game.averageResponseSeconds(finalState),
          hintsUsed: finalState.hintsUsed,
          attempts: finalState.attempts,
          completed,
          // Leaving early is only abandonment if nothing was matched at all.
          abandoned: !completed && finalState.matchedPairs === 0,
          engagementDurationSeconds: game.elapsedSeconds(finalState),
        },
        { matchedPairs: finalState.matchedPairs, totalPairs: finalState.totalPairs },
      );
    },
    [recordSession],
  );

  const repeatGuidance = useCallback(() => {
    if (finished) {
      void speak("games.wellDone");
      return;
    }
    if (state?.previewing) {
      void speak("memoryMatch.preview");
      return;
    }
    void speak("memoryMatch.instruction");
  }, [finished, speak, state?.previewing]);

  const leave = useCallback(async () => {
    if (state && !finished) await finish(state, false);
    router.replace("/games");
  }, [finish, finished, router, state]);

  if (!state) {
    return (
      <Screen title={t("games.memoryMatch")} showBack>
        <Text variant="bodyLarge" center>
          {t("common.loading")}
        </Text>
      </Screen>
    );
  }

  const columns = state.cards.length <= 4 ? 2 : 3;

  return (
    <Screen
      title={t("games.memoryMatch")}
      onRepeat={repeatGuidance}
      showBack
      scrollable
      onBackPress={() => setConfirmExit(true)}
      onHomePress={() => setConfirmExit(true)}
      footer={
        finished ? (
          <View style={styles.footerActions}>
            {config.endWithCalmActivity ? (
              <Button
                label={t("games.endWithCalm")}
                onPress={() => router.replace("/games/memory-lane")}
              />
            ) : (
              <Button label={t("memoryMatch.playNext")} onPress={() => start("next")} />
            )}
            <Button label={t("common.goHome")} onPress={() => router.replace("/games")} tone="secondary" />
          </View>
        ) : (
          <Button
            label={t("games.useHint")}
            onPress={onHint}
            tone="secondary"
            disabled={state.previewing || state.hintsRemaining <= 0}
          />
        )
      }
    >
      <GameFade reducedMotion={reducedMotion}>
      <View style={styles.messageBox}>
        <Text variant="bodyLarge" weight="medium" center>
          {message}
        </Text>
        {state.previewing ? (
          <Text variant="caption" color={role.mutedText} center>
            {previewLeft}
          </Text>
        ) : (
          <View style={styles.progressRow}>
            <Image source={progressStarBadge} style={styles.starBadge} resizeMode="contain" />
            <Text variant="bodyLarge" weight="bold" color="#173D32" center>
              {state.matchedPairs} / {state.totalPairs}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.board}>
        {/* Background decorators */}
        <Image source={floralCornerBouquet} style={styles.decoTopLeft} pointerEvents="none" />
        <Image source={leafSprigDecoration} style={styles.decoBottomRight} pointerEvents="none" />
        
        {state.cards.map((card) => (
          <MemoryCard
            key={card.cardId}
            card={card}
            cardState={state.states[card.cardId]}
            columns={columns}
            reducedMotion={reducedMotion}
            language={language}
            onPress={() => onCardPress(card)}
          />
        ))}
      </View>
      </GameFade>

      <RoundCompleteMoment
        visible={finished}
        reducedMotion={reducedMotion}
        message={t("games.wellDone")}
      />

      <ConfirmDialog
        visible={confirmExit}
        title={t("common.exitConfirm")}
        confirmLabel={t("common.goHome")}
        cancelLabel={t("common.stay")}
        onConfirm={() => {
          setConfirmExit(false);
          void leave();
        }}
        onCancel={() => setConfirmExit(false)}
      />
    </Screen>
  );
}

function MemoryCard({
  card,
  cardState,
  columns,
  reducedMotion,
  language,
  onPress,
}: {
  card: MatchCard;
  cardState: game.CardState;
  columns: number;
  reducedMotion: boolean;
  language: string;
  onPress: () => void;
}): React.ReactElement {
  const faceUp = cardState !== "FACE_DOWN";
  const flip = useRef(new Animated.Value(faceUp ? 1 : 0)).current;
  const bounce = useRef(new Animated.Value(1)).current;
  const wasMatched = useRef(cardState === "MATCHED");

  useEffect(() => {
    if (reducedMotion) {
      flip.setValue(faceUp ? 1 : 0);
      return;
    }
    Animated.timing(flip, {
      toValue: faceUp ? 1 : 0,
      duration: motion.cardFlip,
      useNativeDriver: true,
    }).start();
  }, [faceUp, flip, reducedMotion]);

  useEffect(() => {
    if (cardState === "MATCHED" && !wasMatched.current) {
      bounceScale(bounce, reducedMotion);
    }
    wasMatched.current = cardState === "MATCHED";
  }, [bounce, cardState, reducedMotion]);

  const scale = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.94, 1] });
  const illustrationId = card.object.illustrationId;
  const inEnglish = language === "en";
  const label = inEnglish ? card.object.labelEn : card.object.labelLocal;
  const width = `${100 / columns - 3}%` as const;
  // Smaller on the 8-card board, where the label needs the most room to wrap.
  const pictureSize = columns >= 3 ? 32 : 48;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={faceUp ? label : "Card"}
      accessibilityState={{ selected: cardState === "MATCHED" }}
      style={[styles.cardWrapper, { width }]}
    >
      <Animated.View style={{ flex: 1, transform: [{ scale: bounce }] }}>
      <Animated.View
        style={[
          styles.card,
          shadow.card as object,
          {
            backgroundColor: cardState === "MATCHED" ? colors.mint : faceUp ? colors.surface : colors.mediumGreen,
            borderColor: cardState === "MATCHED" ? colors.mediumGreen : colors.sage,
            transform: [{ scale }],
          },
        ]}
      >
        {faceUp ? (
          <>
            <Image source={getObjectImage(card.object.id)} style={{ width: pictureSize * 1.5, height: pictureSize * 1.5, resizeMode: "contain" }} />
            <View style={styles.labelSlot}>
              <Text
                variant="caption"
                weight="bold"
                color="#173D32"
                center
                style={styles.cardLabel}
              >
                {label}
              </Text>
            </View>
          </>
        ) : (
          <Image source={cardBackTile} style={{ width: "100%", height: "100%", borderRadius: 22, resizeMode: "cover" }} />
        )}
      </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  messageBox: {
    minHeight: 72,
    justifyContent: "center",
    gap: spacing.xs,
  },
  board: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  cardWrapper: {
    aspectRatio: 0.68,
    // A place label ("Kitchen shelf", longer still in Assamese) can wrap to
    // three lines at the large-text scale; a little extra ceiling keeps that
    // from crowding the illustration rather than actually clipping it, since
    // labelSlot below already grows to fit.
    maxHeight: 220,
    minHeight: 140,
  },
  card: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 0,
    backgroundColor: "#FDF8ED",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    overflow: "hidden",
  },
  labelSlot: {
    width: "100%",
    minHeight: 52,
    justifyContent: "center",
  },
  cardLabel: {
    width: "100%",
  },
  footerActions: {
    gap: spacing.md,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  starBadge: {
    width: 24,
    height: 24,
  },
  decoTopLeft: {
    position: "absolute",
    top: -40,
    left: -20,
    width: 120,
    height: 120,
    resizeMode: "contain",
    opacity: 0.8,
  },
  decoBottomRight: {
    position: "absolute",
    bottom: -40,
    right: -20,
    width: 140,
    height: 140,
    resizeMode: "contain",
    opacity: 0.8,
    transform: [{ scaleX: -1 }],
  },
});
