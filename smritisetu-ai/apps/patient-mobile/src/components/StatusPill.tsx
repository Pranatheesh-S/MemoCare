import React from "react";
import { StyleSheet, View } from "react-native";
import { colors, role } from "../theme/colors";
import { radius, spacing } from "../theme/tokens";
import { Text } from "./Text";

type Props = {
  label: string;
  tone?: "online" | "offline" | "muted";
};

/** Connectivity and sync status. Offline is normal, so it is never red. */
export function StatusPill({ label, tone = "muted" }: Props): React.ReactElement {
  const background =
    tone === "online" ? colors.mediumGreen : tone === "offline" ? colors.sage : colors.surfaceSoft;
  const textColor = tone === "online" ? role.headerText : role.bodyText;

  return (
    <View style={[styles.pill, { backgroundColor: background }]}>
      <View style={[styles.dot, { backgroundColor: tone === "online" ? colors.mint : colors.mediumGreen }]} />
      <Text variant="caption" weight="medium" color={textColor}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    maxWidth: "100%",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
