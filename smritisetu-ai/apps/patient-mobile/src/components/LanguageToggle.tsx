import React, { useCallback, useMemo } from "react";
import { Pressable, StyleSheet } from "react-native";
import { role } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../theme/tokens";
import { applyUiLanguage, nextUiLanguage } from "../i18n/uiLanguage";
import { useTranslation } from "../i18n/useTranslation";
import { useAppStore } from "../store/appStore";
import { primaryLanguageFor, resolveContentPack } from "../content";
import { Text } from "./Text";

type Props = {
  compact?: boolean;
  testID?: string;
};

/**
 * Side-of-screen language switch. English is the starting language; tapping
 * this control is what brings in Assamese, and tapping again brings English
 * back.
 */
export function LanguageToggle({ compact = false, testID }: Props): React.ReactElement {
  const { t, language } = useTranslation();
  const stateId = useAppStore((state) => state.stateId);
  const communityId = useAppStore((state) => state.communityId);

  const regional = useMemo(() => {
    const code = primaryLanguageFor(stateId);
    const pack = resolveContentPack(stateId, communityId);
    const meta = pack.languages.find((l) => l.code === code) ?? pack.languages[0];
    return { code, native: meta?.labelNative ?? "অসমীয়া" };
  }, [communityId, stateId]);

  const next = nextUiLanguage(language, regional.code);
  const label = next === "en" ? "English" : regional.native;
  const accessibilityLabel =
    next === "en"
      ? t("common.switchToEnglish")
      : t("common.switchToLanguage", { language: regional.native });

  const onPress = useCallback(() => {
    void applyUiLanguage(next);
  }, [next]);

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={12}
      style={({ pressed }) => [
        styles.button,
        compact ? styles.compact : styles.full,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <Text
        variant={compact ? "caption" : "body"}
        weight="bold"
        color={role.primaryButtonText}
        center
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: role.secondaryButtonBackground,
    borderRadius: radius.pill,
  },
  full: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  compact: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
