import React from "react";
import { Modal, StyleSheet, View } from "react-native";
import { role } from "../theme/colors";
import { radius, spacing } from "../theme/tokens";
import { Text } from "./Text";
import { Button, type ButtonTone } from "./Button";

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmTone?: ButtonTone;
};

/**
 * Confirmation before anything destructive or before leaving an activity.
 *
 * The safe choice is listed first and the whole dialog is large: no small
 * "x" in a corner, no way to dismiss by accident.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmTone = "primary",
}: Props): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal accessibilityLabel={title}>
          <Text variant="heading" weight="bold" center>
            {title}
          </Text>
          {message ? (
            <Text variant="body" color={role.mutedText} center>
              {message}
            </Text>
          ) : null}
          <View style={styles.actions}>
            <Button label={cancelLabel} onPress={onCancel} tone="quiet" />
            <Button label={confirmLabel} onPress={onConfirm} tone={confirmTone} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5, 31, 32, 0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  dialog: {
    width: "100%",
    maxWidth: 480,
    backgroundColor: role.surfaceCardBackground,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  actions: {
    gap: spacing.md,
  },
});
