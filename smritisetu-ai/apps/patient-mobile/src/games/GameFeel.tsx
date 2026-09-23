import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "../components/Text";
import { colors } from "../theme/colors";
import { motion, radius, spacing } from "../theme/tokens";

/** Soft fade-in for a game screen. Instant if reduced motion is on. */
export function GameFade({
  reducedMotion,
  children,
}: {
  reducedMotion: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.gentle,
      useNativeDriver: true,
    }).start();
  }, [opacity, reducedMotion]);

  return <Animated.View style={[styles.fade, { opacity }]}>{children}</Animated.View>;
}

/**
 * A calm, scoreless pause at the end of a round.
 * Never a countdown and never a score.
 */
export function RoundCompleteMoment({
  visible,
  reducedMotion,
  message,
}: {
  visible: boolean;
  reducedMotion: boolean;
  message: string;
}): React.ReactElement | null {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      return;
    }
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.gentle,
        useNativeDriver: true,
      }),
      Animated.delay(motion.roundComplete),
      Animated.timing(opacity, {
        toValue: 0,
        duration: motion.gentle,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, reducedMotion, visible]);

  if (!visible) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.overlay, { opacity }]}>
      <View style={styles.card}>
        <Text variant="display" center>
          🌿
        </Text>
        <Text variant="heading" weight="bold" center color={colors.deepForest}>
          {message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fade: {
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(218, 241, 222, 0.88)",
    zIndex: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.md,
    maxWidth: 360,
    width: "100%",
  },
});
