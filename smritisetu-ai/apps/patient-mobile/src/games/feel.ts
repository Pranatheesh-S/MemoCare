import { Animated, Easing, Vibration } from "react-native";
import { motion } from "../theme/tokens";

/**
 * Shared game feel. All motion is skipped when reducedMotion is on.
 * Haptics use the platform vibration API so no extra native module is required.
 */
export function hapticMatch(reducedMotion: boolean): void {
  if (reducedMotion) return;
  Vibration.vibrate(35);
}

export function hapticComplete(reducedMotion: boolean): void {
  if (reducedMotion) return;
  Vibration.vibrate([0, 30, 80, 40]);
}

export function bounceScale(value: Animated.Value, reducedMotion: boolean): void {
  if (reducedMotion) {
    value.setValue(1);
    return;
  }
  Animated.sequence([
    Animated.timing(value, {
      toValue: 1.08,
      duration: motion.bounce,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }),
    Animated.timing(value, {
      toValue: 1,
      duration: motion.bounce + 40,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }),
  ]).start();
}
