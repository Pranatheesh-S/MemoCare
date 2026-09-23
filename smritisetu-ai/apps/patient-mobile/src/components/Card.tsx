import React, { forwardRef } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { role } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, shadow, spacing } from "../theme/tokens";
import { Text } from "./Text";

type CardProps = {
  children: React.ReactNode;
  tone?: "sage" | "surface" | "soft";
  style?: ViewStyle;
};

const TONE_STYLES = {
  surface: { backgroundColor: "#FFFCF5" },
  soft: { backgroundColor: "#F7FBF4" },
  sage: { backgroundColor: role.cardBackground },
};

export const Card = forwardRef<View, CardProps>(({ children, tone = "surface", style }, ref) => {
  return (
    <View ref={ref} collapsable={false} style={[styles.card, shadow.card as ViewStyle, TONE_STYLES[tone], style]}>
      {children}
    </View>
  );
});

Card.displayName = "Card";

type ActionCardProps = {
  label: string;
  onPress: () => void;
  illustration?: React.ReactNode;
  caption?: string;
  tone?: "sage" | "surface";
  style?: ViewStyle;
  testID?: string;
};

/**
 * A large, tappable card with a picture *and* a word. The whole card is the
 * touch target — there is nothing small to aim at.
 */
export function ActionCard({
  label,
  onPress,
  illustration,
  caption,
  tone = "sage",
  style,
  testID,
}: ActionCardProps): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={caption ? `${label}. ${caption}` : label}
      style={({ pressed }) => [
        styles.actionCard,
        shadow.card as ViewStyle,
        {
          backgroundColor: tone === "sage" ? role.cardBackground : role.surfaceCardBackground,
          opacity: pressed ? 0.88 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
    >
      {illustration ? <View style={styles.illustration}>{illustration}</View> : null}
      <Text variant="bodyLarge" weight="bold" color={role.cardText} center style={styles.label}>
        {label}
      </Text>
      {caption ? (
        // role.cardText, not mutedText: at caption size, mutedText on the
        // default sage tone falls just under WCAG AA for normal text
        // (3.9:1 of the 4.5:1 required). cardText holds 7.6:1 here, and the
        // hierarchy still reads via size and weight, not color alone.
        <Text variant="caption" color={role.cardText} center style={styles.caption}>
          {caption}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: spacing.lg,
    gap: spacing.md,
  },
  actionCard: {
    flex: 1,
    minHeight: 148,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minWidth: MIN_TOUCH_TARGET * 2,
    overflow: "visible",
  },
  illustration: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    width: "100%",
  },
  caption: {
    width: "100%",
  },
});
