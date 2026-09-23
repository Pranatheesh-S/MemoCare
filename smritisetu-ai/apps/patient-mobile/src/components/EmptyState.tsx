import React from "react";
import { StyleSheet, View } from "react-native";
import { role } from "../theme/colors";
import { radius, spacing } from "../theme/tokens";
import { Text } from "./Text";
import { Button } from "./Button";

type Props = {
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  illustration?: React.ReactNode;
};

/**
 * A friendly, never-alarming empty or error state. Nothing here says "error",
 * "failed" or "problem".
 */
export function EmptyState({
  title,
  message,
  actionLabel,
  onAction,
  illustration,
}: Props): React.ReactElement {
  return (
    <View style={styles.container}>
      {illustration ? <View style={styles.illustration}>{illustration}</View> : null}
      <Text variant="subheading" weight="bold" center>
        {title}
      </Text>
      {message ? (
        <Text variant="body" color={role.mutedText} center>
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} tone="secondary" fullWidth={false} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: role.softCardBackground,
    borderRadius: radius.xl,
  },
  illustration: {
    height: 96,
    alignItems: "center",
    justifyContent: "center",
  },
});
