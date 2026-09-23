import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { role } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../theme/tokens";
import { Text } from "./Text";

type Props = {
  onPress: () => void;
  label: string;
  compact?: boolean;
  testID?: string;
};

/**
 * The visible "listen again" control.
 *
 * Voice guidance is never a hidden gesture or a long-press: it is always this
 * button, always labelled, on every screen that speaks.
 */
export function SpeakerButton({ onPress, label, compact = false, testID }: Props): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => [
        styles.container,
        compact ? styles.compact : styles.full,
        { opacity: pressed ? 0.8 : 1 },
      ]}
    >
      <View style={styles.iconWrapper}>
        <SpeakerIcon />
      </View>
      {!compact ? (
        <Text
          variant="bodyLarge"
          weight="medium"
          color={role.primaryButtonText}
          style={styles.label}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SpeakerIcon(): React.ReactElement {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9v6h4l5 4V5L8 9H4z"
        fill={role.primaryButtonText}
        stroke={role.primaryButtonText}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <Path
        d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"
        stroke={role.primaryButtonText}
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: role.secondaryButtonBackground,
    gap: spacing.md,
  },
  full: {
    alignSelf: "stretch",
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  compact: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.pill,
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flexShrink: 1,
    flexGrow: 1,
  },
});
