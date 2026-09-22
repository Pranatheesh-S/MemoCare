import { Platform, StyleSheet } from "react-native";
import { NE_STATES, type NEStateId } from "./model";

/* -------------------------------------------------------------------------- */
/*  Palette — warm, calm, trustworthy. Green heritage on a soft paper ground. */
/* -------------------------------------------------------------------------- */

export const palette = {
  paper: "#F7F5F0",
  paperDim: "#EFEDE6",
  card: "#FFFFFF",
  ink: "#17322A",
  inkSoft: "#4C6259",
  faint: "#8A9B94",
  line: "#E7E7E0",
  lineStrong: "#D8DAD1",

  primary: "#0E6E5C",
  primaryDark: "#0A5347",
  primarySoft: "#E0F0EC",
  primaryTint: "#F0F7F5",

  sand: "#DE9B3A",
  sandSoft: "#FaF0DE",

  danger: "#BE3A2B",
  dangerSoft: "#FAE9E6",
  warn: "#B0741C",
  warnSoft: "#F8EFDF",
  success: "#1E7A46",
  successSoft: "#E3F2E9",
} as const;

/** Back-compatible aliases so older screens keep their imports. */
export const colors = {
  ...palette,
  canvas: palette.paper,
  border: palette.line,
  white: palette.card,
  muted: palette.inkSoft,
  teal: palette.primary,
  tealSoft: palette.primarySoft,
  urgent: palette.danger,
  attention: palette.warn,
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 36 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const shadow = {
  card: Platform.select({
    ios: { shadowColor: "#1c3a32", shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    android: { elevation: 2 },
    default: {},
  }),
  lift: Platform.select({
    ios: { shadowColor: "#1c3a32", shadowOpacity: 0.14, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
    android: { elevation: 6 },
    default: {},
  }),
} as const;

/** The accent colour the patient app will use for this state's content pack. */
export function stateAccent(stateId: NEStateId): string {
  return NE_STATES.find((s) => s.id === stateId)?.accent ?? palette.primary;
}

/* -------------------------------------------------------------------------- */
/*  Shared styles (keys kept stable for existing screens; restyled)          */
/* -------------------------------------------------------------------------- */

export const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.paper },
  page: { padding: space.lg, paddingBottom: space.xxl + space.xl },

  eyebrow: {
    color: palette.primary,
    fontSize: 11.5,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  heading: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 6,
    marginBottom: space.lg,
  },

  card: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    padding: space.lg + 2,
    marginBottom: space.md,
    ...(shadow.card as object),
  },

  text: { color: palette.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: palette.inkSoft, fontSize: 13.5, lineHeight: 20 },

  button: {
    backgroundColor: palette.primary,
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    marginTop: space.md,
  },
  buttonText: { color: palette.card, fontWeight: "800", fontSize: 15.5, letterSpacing: 0.2 },

  input: {
    backgroundColor: palette.card,
    borderColor: palette.lineStrong,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md + 2,
    paddingVertical: 13,
    fontSize: 15.5,
    marginTop: 6,
    color: palette.ink,
  },

  sectionTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "800",
    marginTop: space.xl,
    marginBottom: space.xs,
    letterSpacing: -0.2,
  },
  label: {
    color: palette.inkSoft,
    fontSize: 11.5,
    fontWeight: "800",
    marginTop: space.md,
    letterSpacing: 0.6,
  },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 6 },
  chip: {
    borderWidth: 1.5,
    borderColor: palette.lineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: palette.card,
  },
  chipActive: { backgroundColor: palette.ink, borderColor: palette.ink },
  chipText: { color: palette.inkSoft, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: palette.card },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },

  codeBox: {
    backgroundColor: palette.primaryTint,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    borderColor: palette.primarySoft,
    padding: space.xl,
    alignItems: "center",
    marginBottom: space.lg,
  },
  codeText: {
    color: palette.primaryDark,
    fontSize: 44,
    fontWeight: "900",
    letterSpacing: 8,
  },
});
