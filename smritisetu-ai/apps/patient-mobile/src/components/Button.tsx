import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, role } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, shadow, spacing } from "../theme/tokens";
import { Text } from "./Text";

export type ButtonTone = "primary" | "secondary" | "quiet" | "help";

type Props = {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: ViewStyle;
  testID?: string;
};

const TONE_STYLES: Record<ButtonTone, { background: string; text: string; border?: string }> = {
  primary: { background: role.primaryButtonBackground, text: role.primaryButtonText },
  secondary: { background: role.secondaryButtonBackground, text: role.secondaryButtonText },
  quiet: { background: role.quietButtonBackground, text: role.quietButtonText, border: role.border },
  // Red is reserved for asking for help. It appears nowhere else.
  help: { background: role.helpBackground, text: role.helpText },
};

/**
 * A large, always-labelled button.
 *
 * Icons are decoration only — there is never an icon without its word, because
 * a symbol alone is easy to misread.
 */
export function Button({
  label,
  onPress,
  tone = "primary",
  icon,
  disabled = false,
  loading = false,
  fullWidth = true,
  accessibilityHint,
  style,
  testID,
}: Props): React.ReactElement {
  const palette = TONE_STYLES[tone];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      // Generous slop so a slightly-off tap still lands.
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        shadow.card as ViewStyle,
        {
          backgroundColor: tone === "primary" ? "#1A4331" : tone === "help" ? "#D33A31" : palette.background,
          borderColor: palette.border ?? "transparent",
          borderWidth: palette.border ? 2 : 0,
          alignSelf: fullWidth ? "stretch" : "flex-start",
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }]
        },
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={palette.text} />
        ) : (
          <>
            {icon ? <View style={styles.icon}>{icon}</View> : null}
            <Text variant="bodyLarge" weight="bold" color={tone === "quiet" ? "#1A4331" : "#FFFFFF"} center style={styles.label}>
              {label}
            </Text>
          </>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH_TARGET + 8,
    borderRadius: 30, // Pill shape
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    justifyContent: "center",
    elevation: 3,
  },
  content: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  icon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 80,
  },
});

export { colors };
