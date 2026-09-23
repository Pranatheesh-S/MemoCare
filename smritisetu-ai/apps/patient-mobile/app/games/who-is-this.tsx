import React, { useCallback, useEffect, useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { EmptyState } from "../../src/components/EmptyState";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Illustration } from "../../src/games/illustrationMap";
import { colors, role } from "../../src/theme/colors";
import { radius, shadow, spacing } from "../../src/theme/tokens";
import { useTranslation } from "../../src/i18n/useTranslation";
import { useVoiceGuidance } from "../../src/audio/useVoiceGuidance";
import { voiceManager } from "../../src/audio/voiceManager";
import { useAppStore } from "../../src/store/appStore";
import { useGameSession } from "../../src/games/useGameSession";
import { MemoryRepository, type CachedMemory } from "../../src/db/repositories/memoryRepository";
import * as game from "../../src/games/logic/whoIsThis";
import { GameFade, RoundCompleteMoment } from "../../src/games/GameFeel";
import { hapticComplete, hapticMatch } from "../../src/games/feel";
import { son, daughter, grandson, joyfulGrandmotherInASaree, asha } from "../../src/assets/embeddedAssets";
import { resolveMemoryImage } from "../../src/utils/imageResolver";

const getFallbackImage = (name?: string) => {
  const n = name?.toLowerCase() ?? "";
  if (n.includes("asha") || n.includes("wife")) return asha;
  if (n.includes("daughter") || n.includes("nabanita")) return daughter;
  if (n.includes("grandson") || n.includes("rishav")) return grandson;
  if (n.includes("son") || n.includes("bhaskar")) return son;
  return joyfulGrandmotherInASaree;
};

/**
 * Who Is This?
 *
 * Family photographs are shown only from the device's own consented cache, and
 * the patient is never told they forgot anyone: an unrecognised face is simply
 * introduced again, warmly, with the relationship and a happy memory.
 *
 * Answers are given by touch. The answer handler is deliberately separate from
 * the touch handler so a voice answer can be added later without changing the
 * game logic.
 */
export default function WhoIsThisScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("whoIsThis.instruction");
  const patientId = useAppStore((state) => state.patientId);
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const { config, recordSession, resetRecording } = useGameSession("WHO_IS_THIS");

  const [people, setPeople] = useState<CachedMemory[] | null>(null);
  const [state, setState] = useState<game.WhoIsThisState | null>(null);
  const [message, setMessage] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!patientId) return;
    void (async () => {
      const repo = new MemoryRepository();
      let p = await repo.listPeople(patientId);
      
      // Auto-seed for Demo/Testing
      if (p.length < 2) {
        console.log("Seeding mock family memories...");
        await repo.replaceAll(patientId, [
          { memoryId: "seed-1", category: "MY_FAMILY", assetType: "PHOTO", titleEn: "My lovely wife", titleAs: "মোৰ পত্নী আশা", personName: "Asha", relationshipEn: "Wife", relationshipAs: "পত্নী", storyEn: "We took this photo on our 40th anniversary.", storyAs: "আমাৰ ৪০তম বাৰ্ষিকীৰ দিনা আমি এই ছবি তুলিছিলো।", available: true, favourite: true, mediaUrl: asha.uri },
          { memoryId: "seed-2", category: "MY_FAMILY", assetType: "PHOTO", titleEn: "My daughter", titleAs: "মোৰ জীয়ৰী নবনীতা", personName: "Nabanita", relationshipEn: "Daughter", relationshipAs: "জীয়ৰী", storyEn: "She always loved visiting the tea gardens.", storyAs: "তাই চাহ বাগিচালৈ গৈ সদায় ভাল পাইছিল।", available: true, favourite: true, mediaUrl: daughter.uri },
          { memoryId: "seed-3", category: "MY_FAMILY", assetType: "PHOTO", titleEn: "My grandson", titleAs: "মোৰ নাতি ঋষভ", personName: "Rishav", relationshipEn: "Grandson", relationshipAs: "নাতি", storyEn: "He just learned how to ride a bicycle!", storyAs: "সি এইমাত্ৰ চাইকেল চলাবলৈ শিকিছে!", available: true, favourite: true, mediaUrl: grandson.uri },
          { memoryId: "seed-4", category: "MY_FAMILY", assetType: "PHOTO", titleEn: "My son", titleAs: "মোৰ পুত্ৰ ভাস্কৰ", personName: "Bhaskar", relationshipEn: "Son", relationshipAs: "পুতেক", storyEn: "He came to visit last Diwali.", storyAs: "সি যোৱা দীপাৱলীত আমাক দেখা কৰিবলৈ আহিছিল।", available: true, favourite: true, mediaUrl: son.uri }
        ] as any[]);
        p = await repo.listPeople(patientId);
      }
      
      setPeople(p);
    })();
  }, [patientId]);

  const start = useCallback(() => {
    if (!people) return;
    resetRecording();
    const fresh = game.createGame(people, config.difficulty, config.hintsAllowed);
    setState(fresh);
    setFinished(false);
    setMessage(t("whoIsThis.instruction"));
    void speak("whoIsThis.instruction");
  }, [config.difficulty, config.hintsAllowed, people, resetRecording, speak, t]);

  useEffect(() => {
    if (config.loaded && people && !state) start();
  }, [config.loaded, people, start, state]);

  const finish = useCallback(
    async (finalState: game.WhoIsThisState, completed: boolean) => {
      setFinished(true);
      const attempted = finalState.rounds.filter((r) => r.attemptedIds.length > 0).length;
      await recordSession(
        {
          accuracy: game.computeAccuracy(finalState),
          responseTimeSeconds: game.averageResponseSeconds(finalState),
          hintsUsed: finalState.hintsUsed,
          attempts: finalState.totalAttempts,
          completed,
          abandoned: !completed && attempted === 0,
          engagementDurationSeconds: game.elapsedSeconds(finalState),
        },
        {
          selectedAnswerId: finalState.rounds[finalState.index]?.attemptedIds.at(-1),
          correctAnswerId: finalState.rounds[finalState.index]?.memory.memoryId,
        },
      );
    },
    [recordSession],
  );

  /** Shared by touch today and by voice later. */
  const submitAnswer = useCallback(
    (choiceId: string) => {
      setState((current) => {
        if (!current) return current;
        const result = game.answer(current, choiceId);
        if (result.outcome === "IGNORED") return current;

        const round = result.state.rounds[result.state.index];
        if (result.isCorrect) {
          hapticMatch(reducedMotion);
          setMessage(t("whoIsThis.correct", { name: round.memory.personName ?? "" }));
          void speak("games.doingWell");
        } else if (result.state.rounds[result.state.index].revealed) {
          // Introduced again, never "you got it wrong".
          setMessage(
            t("whoIsThis.gentle", {
              name: round.memory.personName ?? "",
              relationship:
                (language === "as" ? round.memory.relationshipAs : round.memory.relationshipEn) ?? "",
            }),
          );
          void speak("games.tryTogether");
        } else {
          setMessage(t("games.tryTogether"));
          void speak("games.tryTogether");
        }

        return result.state;
      });
    },
    [language, reducedMotion, speak, t],
  );

  const onNext = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const advanced = game.nextRound(current);
      if (advanced.completed) {
        hapticComplete(reducedMotion);
        setMessage(t("games.thankYou"));
        void speak("games.thankYou");
        void finish(advanced, true);
      } else {
        setMessage(t("whoIsThis.instruction"));
        void speak("whoIsThis.instruction");
      }
      return advanced;
    });
  }, [finish, reducedMotion, speak, t]);

  const leave = useCallback(async () => {
    if (state && !finished) await finish(state, false);
    router.replace("/games");
  }, [finish, finished, router, state]);

  if (people && people.length < 2) {
    return (
      <Screen title={t("games.whoIsThis")} showBack>
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

  const round = state ? game.currentRound(state) : null;
  if (!state || !round) {
    return (
      <Screen title={t("games.whoIsThis")} showBack>
        <Text variant="bodyLarge" center>
          {t("common.loading")}
        </Text>
      </Screen>
    );
  }

  const photoSource = resolveMemoryImage(round.memory) ?? getFallbackImage(round.memory.personName);
  const story = language === "as" ? round.memory.storyAs : round.memory.storyEn;

  return (
    <Screen
      title={t("games.whoIsThis")}
      onRepeat={repeat}
      showBack
      scrollable
      onBackPress={() => setConfirmExit(true)}
      onHomePress={() => setConfirmExit(true)}
      footer={
        finished ? (
          <View style={styles.footerActions}>
            <Button label={t("games.playAgain")} onPress={start} tone="secondary" />
            <Button label={t("common.goHome")} onPress={() => router.replace("/games")} />
          </View>
        ) : round.revealed ? (
          <Button label={t("common.next")} onPress={onNext} />
        ) : (
          <Button
            label={t("games.useHint")}
            onPress={() => setState((s) => (s ? game.useHint(s).state : s))}
            tone="secondary"
            disabled={round.hintsRemaining <= 0 || round.choices.length <= 2}
          />
        )
      }
    >
      <GameFade reducedMotion={reducedMotion}>
      <View style={styles.photoWrapper}>
        <Image
          source={photoSource}
          style={styles.photo}
          resizeMode="cover"
          accessibilityLabel={t("whoIsThis.instruction")}
          onError={() => {
            // A missing photo is skipped rather than shown broken.
            void new MemoryRepository().markUnavailable(round.memory.memoryId);
            onNext();
          }}
        />
      </View>

      <Text variant="bodyLarge" weight="medium" center style={styles.message}>
        {message}
      </Text>

      {round.revealed ? (
        <View style={styles.revealBlock}>
          {story ? (
            <Text variant="body" color={role.mutedText} center>
              {t("whoIsThis.memory", { memory: story })}
            </Text>
          ) : null}
          {round.memory.voiceLocalPath || round.memory.voiceUrl ? (
            <Button
              label={t("whoIsThis.playVoice", { name: round.memory.personName ?? "" })}
              tone="secondary"
              onPress={() =>
                void voiceManager.playClip((round.memory.voiceLocalPath ?? round.memory.voiceUrl) as string)
              }
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.choices}>
          {round.choices.map((choice) => (
            <Button
              key={choice.id}
              label={choice.name}
              onPress={() => submitAnswer(choice.id)}
              tone="primary"
              style={styles.choiceButton}
            />
          ))}
        </View>
      )}
      </GameFade>

      <RoundCompleteMoment
        visible={finished}
        reducedMotion={reducedMotion}
        message={t("games.thankYou")}
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

const styles = StyleSheet.create({
  photoWrapper: {
    alignItems: "center",
  },
  photo: {
    width: "100%",
    maxWidth: 300,
    aspectRatio: 1,
    borderRadius: radius.xl,
    borderWidth: 3,
    borderColor: colors.sage,
    ...(shadow.card as object),
  },
  photoFallback: {
    width: "100%",
    maxWidth: 300,
    aspectRatio: 1,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    minHeight: 60,
  },
  choices: {
    gap: spacing.md,
  },
  choiceButton: {
    minHeight: 64,
  },
  revealBlock: {
    gap: spacing.md,
  },
  footerActions: {
    gap: spacing.md,
  },
});
