import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View, Image } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Illustration } from "../../src/games/illustrationMap";
import { colors, role } from "../../src/theme/colors";
import { MIN_TOUCH_TARGET, radius, shadow, spacing } from "../../src/theme/tokens";
import { useTranslation } from "../../src/i18n/useTranslation";
import { useVoiceGuidance } from "../../src/audio/useVoiceGuidance";
import { useGameSession } from "../../src/games/useGameSession";
import * as game from "../../src/games/logic/routineBuilder";
import { selectRoutineStepsFromSchedules } from "../../src/games/gameContent";
import { lunchMealIcon, drinkWaterIcon, morningTabletIcon, reminderFlowerIcon } from "../../src/assets/embeddedAssets";

const getRoutineIcon = (id: string, label: string) => {
  const n = (id + " " + label).toLowerCase();
  if (n.includes("lunch") || n.includes("meal") || n.includes("plate") || n.includes("breakfast")) return lunchMealIcon;
  if (n.includes("water") || n.includes("drink") || n.includes("hydration")) return drinkWaterIcon;
  if (n.includes("medicine") || n.includes("tablet") || n.includes("pill")) return morningTabletIcon;
  return reminderFlowerIcon;
};
import { GameFade, RoundCompleteMoment } from "../../src/games/GameFeel";
import { hapticComplete, hapticMatch } from "../../src/games/feel";
import { useAppStore } from "../../src/store/appStore";
import { ScheduleRepository } from "../../src/db/repositories";

/**
 * My Routine.
 *
 * Ordering is done by tapping — pick a card up, tap where it belongs — with
 * explicit up and down controls as an alternative. Precise drag-and-drop is
 * deliberately not required.
 */
export default function RoutineBuilderScreen(): React.ReactElement {
  const router = useRouter();
  const { t, language } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("routineBuilder.instruction");
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const patientId = useAppStore((state) => state.patientId);
  const { config, recordSession, resetRecording } = useGameSession("ROUTINE_BUILDER");

  const [state, setState] = useState<game.RoutineBuilderState | null>(null);
  const [message, setMessage] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);
  const [finished, setFinished] = useState(false);

  const start = useCallback(async () => {
    resetRecording();
    // Today's own routine when there is enough of it cached; the default
    // otherwise — never a blank puzzle.
    const schedules = patientId ? await new ScheduleRepository().listActive(patientId) : [];
    const steps = selectRoutineStepsFromSchedules(schedules, config.difficulty) ?? undefined;
    setState(game.createGame(config.difficulty, config.hintsAllowed, undefined, undefined, steps));
    setFinished(false);
    setMessage(t("routineBuilder.instruction"));
    void speak("routineBuilder.instruction");
  }, [config.difficulty, config.hintsAllowed, patientId, resetRecording, speak, t]);

  useEffect(() => {
    if (config.loaded && !state) void start();
  }, [config.loaded, start, state]);

  const finish = useCallback(
    async (finalState: game.RoutineBuilderState, completed: boolean) => {
      setFinished(true);
      const correct = game.countCorrect(finalState);
      await recordSession(
        {
          accuracy: game.computeAccuracy(finalState),
          responseTimeSeconds:
            finalState.moves > 0 ? game.elapsedSeconds(finalState) / finalState.moves : game.elapsedSeconds(finalState),
          hintsUsed: finalState.hintsUsed,
          attempts: finalState.moves,
          completed,
          abandoned: !completed && finalState.moves === 0,
          engagementDurationSeconds: game.elapsedSeconds(finalState),
        },
        {
          correctPositions: correct,
          totalPositions: finalState.correctOrder.length,
          moves: finalState.moves,
        },
      );
    },
    [recordSession],
  );

  const onCheck = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const result = game.check(current);
      if (result.isComplete) {
        hapticComplete(reducedMotion);
        setMessage(t("routineBuilder.correct"));
        void speak("routineBuilder.correct");
        void finish(result.state, true);
      } else {
        hapticMatch(reducedMotion);
        setMessage(t("routineBuilder.partial"));
        void speak("games.goodAttempt");
      }
      return result.state;
    });
  }, [finish, reducedMotion, speak, t]);

  const onHint = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const { state: hinted, placedStepId } = game.useHint(current);
      if (!placedStepId) return current;
      void speak("games.doingWell");
      setMessage(t("games.doingWell"));
      return hinted;
    });
  }, [speak, t]);

  const leave = useCallback(async () => {
    if (state && !finished) await finish(state, false);
    router.replace("/games");
  }, [finish, finished, router, state]);

  if (!state) {
    return (
      <Screen title={t("games.routineBuilder")} showBack>
        <Text variant="bodyLarge" center>
          {t("common.loading")}
        </Text>
      </Screen>
    );
  }

  const flags = state.checked ? game.correctPositionFlags(state) : [];

  return (
    <Screen
      title={t("games.routineBuilder")}
      onRepeat={repeat}
      showBack
      onBackPress={() => setConfirmExit(true)}
      onHomePress={() => setConfirmExit(true)}
      scrollable
      footer={
        finished ? (
          <View style={styles.footerActions}>
            <Button label={t("games.playAgain")} onPress={start} tone="secondary" />
            <Button label={t("common.goHome")} onPress={() => router.replace("/games")} />
          </View>
        ) : (
          <View style={styles.footerActions}>
            <Button
              label={t("games.useHint")}
              onPress={onHint}
              tone="secondary"
              disabled={state.hintsRemaining <= 0}
            />
            <Button label={t("routineBuilder.check")} onPress={onCheck} />
          </View>
        )
      }
    >
      <GameFade reducedMotion={reducedMotion}>
      <Text variant="bodyLarge" weight="medium" center style={styles.message}>
        {message}
      </Text>

      <View style={styles.list}>
        {state.order.map((stepId, index) => {
          const step = state.steps[stepId];
          const isSelected = state.selectedId === stepId;
          const isLocked = state.lockedPositions.includes(index);
          const isCorrect = flags[index];

          return (
            <View key={stepId} style={styles.row}>
              <View
                style={[
                  styles.position,
                  { backgroundColor: isCorrect ? colors.mediumGreen : colors.sage },
                ]}
              >
                <Text variant="bodyLarge" weight="bold" color={isCorrect ? colors.mint : colors.deepForest}>
                  {index + 1}
                </Text>
              </View>

              <Pressable
                onPress={() => setState((s) => (s ? game.selectCard(s, stepId) : s))}
                disabled={isLocked || finished}
                accessibilityRole="button"
                accessibilityLabel={language === "as" ? step.labelAs : step.labelEn}
                accessibilityState={{ selected: isSelected, disabled: isLocked }}
                style={({ pressed }) => [
                  styles.card,
                  shadow.card as object,
                  {
                    backgroundColor: isSelected ? colors.mediumGreen : isLocked ? colors.mint : colors.surface,
                    borderColor: isSelected ? colors.deepForest : colors.sage,
                    opacity: pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Image source={getRoutineIcon(step.illustrationId, step.labelEn)} style={{ width: 44, height: 44, resizeMode: "contain" }} />
                <Text
                  variant="bodyLarge"
                  weight="medium"
                  color={isSelected ? colors.mint : role.bodyText}
                  style={styles.cardLabel}
                >
                  {language === "as" ? step.labelAs : step.labelEn}
                </Text>
              </Pressable>

              <View style={styles.moveButtons}>
                <MoveButton
                  label={t("routineBuilder.moveUp")}
                  direction="UP"
                  disabled={index === 0 || isLocked || finished}
                  onPress={() => setState((s) => (s ? game.moveCard(s, stepId, "UP") : s))}
                />
                <MoveButton
                  label={t("routineBuilder.moveDown")}
                  direction="DOWN"
                  disabled={index === state.order.length - 1 || isLocked || finished}
                  onPress={() => setState((s) => (s ? game.moveCard(s, stepId, "DOWN") : s))}
                />
              </View>
            </View>
          );
        })}
      </View>
      </GameFade>

      <RoundCompleteMoment
        visible={finished}
        reducedMotion={reducedMotion}
        message={t("routineBuilder.correct")}
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

function MoveButton({
  label,
  direction,
  disabled,
  onPress,
}: {
  label: string;
  direction: "UP" | "DOWN";
  disabled: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => [
        styles.moveButton,
        { opacity: disabled ? 0.3 : pressed ? 0.7 : 1 },
      ]}
    >
      <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
        <Path
          d={direction === "UP" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"}
          stroke={colors.mint}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  message: {
    minHeight: 60,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  position: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET + 8,
    borderRadius: 24,
    borderWidth: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cardLabel: {
    flex: 1,
    minWidth: 0,
  },
  moveButtons: {
    gap: spacing.xs,
  },
  moveButton: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 14,
    backgroundColor: colors.mediumGreen,
    alignItems: "center",
    justifyContent: "center",
  },
  footerActions: {
    gap: spacing.md,
  },
});
