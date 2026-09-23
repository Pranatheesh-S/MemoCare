import React, { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { colors, role } from "../theme/colors";
import { radius } from "../theme/tokens";
import { Text } from "./Text";
import { resolvePersonAvatar } from "../utils/imageResolver";

type Props = {
  uri?: string | null;
  name: string;
  relationship?: string | null;
  size?: number;
  onUnavailable?: () => void;
};

/**
 * A photograph that degrades gracefully.
 *
 * If a custom image is missing or not downloaded, existing family illustrations
 * are reused. If no illustration exists, the initial is shown instead —
 * a patient must never see a broken image or crash.
 */
export function Avatar({ uri, name, relationship, size = 96, onUnavailable }: Props): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const resolvedSource = !failed ? resolvePersonAvatar(name, relationship, uri) : null;

  return (
    <View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
      accessibilityRole="image"
      accessibilityLabel={name}
    >
      {resolvedSource ? (
        <Image
          source={resolvedSource}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          resizeMode="cover"
          onError={() => {
            setFailed(true);
            onUnavailable?.();
          }}
        />
      ) : (
        <Text variant="display" weight="bold" color={role.headerText}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.mediumGreen,
    borderWidth: 3,
    borderColor: colors.sage,
    borderRadius: radius.pill,
    overflow: "hidden",
  },
});
