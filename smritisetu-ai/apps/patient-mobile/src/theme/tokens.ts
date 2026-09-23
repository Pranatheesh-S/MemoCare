import { Platform } from "react-native";
import { colors } from "./colors";

/**
 * Elderly-friendly sizing.
 *
 * Every value here exists to serve a specific accessibility requirement:
 *  * touch targets are never smaller than 56x56
 *  * body text starts at 18, button text at 20, headings at 26-32
 *  * spacing is generous so nothing feels cramped or easy to mis-tap
 */

export const MIN_TOUCH_TARGET = 56;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 12,
  md: 20,
  lg: 24,
  xl: 28,
  pill: 999,
} as const;

export const fontSize = {
  caption: 16,
  body: 18,
  bodyLarge: 20,
  button: 22,
  title: 22,
  subheading: 24,
  heading: 28,
  headingLarge: 32,
  display: 40,
} as const;

export const lineHeight = {
  caption: 26,
  body: 28,
  bodyLarge: 32,
  button: 32,
  title: 30,
  subheading: 36,
  heading: 40,
  headingLarge: 44,
  display: 52,
} as const;

export const fontWeight = {
  regular: "400",
  medium: "600",
  bold: "700",
} as const;

/** Soft, low-contrast elevation. Never a harsh drop shadow. */
export const shadow = {
  small: Platform.select({
    ios: {
      shadowColor: colors.deepForest,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 6,
    },
    android: { elevation: 1 },
    default: {},
  }),
  card: Platform.select({
    ios: {
      shadowColor: colors.deepForest,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
    },
    android: { elevation: 3 },
    default: {},
  }),
  raised: Platform.select({
    ios: {
      shadowColor: colors.deepForest,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
    },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

/**
 * When the caregiver enables "Bigger text", every size scales by this factor.
 * Layouts use flexible heights so nothing clips.
 */
export const LARGE_TEXT_SCALE = 1.15;

export function scaleFont(size: number, largeText: boolean): number {
  return largeText ? Math.round(size * LARGE_TEXT_SCALE) : size;
}

/** Animation durations. All are skipped entirely when reduced motion is on. */
export const motion = {
  cardFlip: 260,
  fade: 200,
  gentle: 400,
  bounce: 180,
  roundComplete: 1400,
} as const;
