/**
 * The SmritiSetu AI palette. These values are fixed by the product brief and
 * are the single source of colour for the whole application — no screen should
 * ever hard-code a hex value.
 */
export const colors = {
  deepForest: "#051F20",
  forest: "#0B2B26",
  darkGreen: "#163832",
  mediumGreen: "#235347",
  sage: "#8EB69B",
  mint: "#DAF1DE",

  background: "#DAF1DE",
  surface: "#FFFFFF",
  surfaceSoft: "#EAF6EC",
  primary: "#0B2B26",
  primaryDark: "#051F20",
  secondary: "#235347",
  accent: "#8EB69B",
  textPrimary: "#051F20",
  textSecondary: "#235347",
  textOnDark: "#DAF1DE",
  border: "#8EB69B",
  success: "#235347",
  warning: "#D69E2E",
  emergency: "#B33A3A",
} as const;

export type ColorName = keyof typeof colors;

/**
 * Semantic roles, so screens say what a colour is *for* rather than which
 * green it is. Red appears in exactly one role: emergency/help.
 */
export const role = {
  screenBackground: colors.background,
  headerBackground: colors.deepForest,
  headerText: colors.textOnDark,

  primaryButtonBackground: colors.primary,
  primaryButtonText: colors.textOnDark,
  secondaryButtonBackground: colors.secondary,
  secondaryButtonText: colors.textOnDark,
  quietButtonBackground: colors.surface,
  quietButtonText: colors.textPrimary,

  cardBackground: colors.accent,
  cardText: colors.textPrimary,
  surfaceCardBackground: colors.surface,
  surfaceCardText: colors.textPrimary,
  softCardBackground: colors.surfaceSoft,

  bodyText: colors.textPrimary,
  mutedText: colors.textSecondary,
  border: colors.border,

  helpBackground: colors.emergency,
  helpText: "#FFFFFF",

  successText: colors.success,
  warningText: colors.warning,
} as const;
