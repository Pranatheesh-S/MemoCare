import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { palette, radius, shadow, space } from "./theme";

type FeatherName = React.ComponentProps<typeof Feather>["name"];

/* -------------------------------------------------------------------------- */
/*  Card                                                                      */
/* -------------------------------------------------------------------------- */

export function Card({
  children,
  onPress,
  accent,
  style,
  padded = true,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  /** Optional colour bar down the left edge. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  const body = (
    <View style={[ui.card, padded && ui.cardPad, style]}>
      {accent ? <View style={[ui.cardAccent, { backgroundColor: accent }]} /> : null}
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] }]}>
      {body}
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Button                                                                    */
/* -------------------------------------------------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  label,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  full = true,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: FeatherName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = BUTTON_VARIANTS[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        ui.btn,
        { backgroundColor: v.bg, borderColor: v.border },
        full && { alignSelf: "stretch" },
        (pressed || isDisabled) && { opacity: isDisabled ? 0.45 : 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={ui.btnInner}>
          {icon ? <Feather name={icon} size={17} color={v.fg} /> : null}
          <Text style={[ui.btnText, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const BUTTON_VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: palette.primary, fg: palette.card, border: palette.primary },
  secondary: { bg: palette.primaryTint, fg: palette.primaryDark, border: palette.primarySoft },
  ghost: { bg: "transparent", fg: palette.inkSoft, border: palette.lineStrong },
  danger: { bg: palette.dangerSoft, fg: palette.danger, border: palette.dangerSoft },
};

/* -------------------------------------------------------------------------- */
/*  Field                                                                     */
/* -------------------------------------------------------------------------- */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  error,
  keyboardType,
  secureTextEntry,
  autoCapitalize,
  multiline,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={{ marginTop: space.md }}>
      <Text style={ui.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.faint}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        autoFocus={autoFocus}
        multiline={multiline}
        style={[
          ui.input,
          multiline && { minHeight: 88, textAlignVertical: "top", paddingTop: 12 },
          error ? { borderColor: palette.danger } : null,
        ]}
      />
      {error ? (
        <Text style={ui.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={ui.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chip                                                                      */
/* -------------------------------------------------------------------------- */

export function Chip({
  label,
  active,
  onPress,
  activeColor = palette.ink,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  activeColor?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        ui.chip,
        active && { backgroundColor: activeColor, borderColor: activeColor },
      ]}
    >
      <Text style={[ui.chipText, active && { color: palette.card }]}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------------- */
/*  Pill (status badge)                                                       */
/* -------------------------------------------------------------------------- */

type PillTone = "neutral" | "info" | "success" | "warn" | "danger";

export function Pill({ label, tone = "neutral", icon }: { label: string; tone?: PillTone; icon?: FeatherName }) {
  const c = PILL_TONES[tone];
  return (
    <View style={[ui.pill, { backgroundColor: c.bg }]}>
      {icon ? <Feather name={icon} size={11} color={c.fg} /> : null}
      <Text style={[ui.pillText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
  neutral: { bg: palette.paperDim, fg: palette.inkSoft },
  info: { bg: palette.primarySoft, fg: palette.primaryDark },
  success: { bg: palette.successSoft, fg: palette.success },
  warn: { bg: palette.warnSoft, fg: palette.warn },
  danger: { bg: palette.dangerSoft, fg: palette.danger },
};

/* -------------------------------------------------------------------------- */
/*  Avatar                                                                    */
/* -------------------------------------------------------------------------- */

export function Avatar({ name, accent = palette.primary, size = 46 }: { name: string; accent?: string; size?: number }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${accent}22`,
        borderWidth: 2,
        borderColor: `${accent}55`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: accent, fontWeight: "800", fontSize: size * 0.36 }}>{initials || "?"}</Text>
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                             */
/* -------------------------------------------------------------------------- */

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.row, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  /** Optional right-aligned control, e.g. an "Add" link. */
  action?: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: space.xl, marginBottom: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={ui.sectionTitle}>{title}</Text>
        {action ?? null}
      </View>
      {hint ? <Text style={ui.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

/** A small text+icon link, for section actions. */
export function LinkButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: FeatherName;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      {icon ? <Feather name={icon} size={14} color={palette.primary} /> : null}
      <Text style={{ color: palette.primary, fontWeight: "800", fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.divider, style]} />;
}

export function Note({ children, tone = "info" }: { children: React.ReactNode; tone?: "info" | "warn" }) {
  const c = tone === "warn" ? { bg: palette.warnSoft, fg: palette.warn } : { bg: palette.primaryTint, fg: palette.primaryDark };
  return (
    <View style={[ui.note, { backgroundColor: c.bg }]}>
      <Feather name={tone === "warn" ? "alert-triangle" : "info"} size={14} color={c.fg} style={{ marginTop: 1 }} />
      <Text style={[ui.noteText, { color: c.fg }]}>{children}</Text>
    </View>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  body,
}: {
  icon?: FeatherName;
  title: string;
  body?: string;
}) {
  return (
    <View style={ui.empty}>
      <View style={ui.emptyIcon}>
        <Feather name={icon} size={22} color={palette.faint} />
      </View>
      <Text style={ui.emptyTitle}>{title}</Text>
      {body ? <Text style={ui.emptyBody}>{body}</Text> : null}
    </View>
  );
}

export function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <View style={ui.kv}>
      <Text style={ui.kvKey}>{k}</Text>
      <Text style={ui.kvVal}>{v}</Text>
    </View>
  );
}

export const textStyles = {
  title: { color: palette.ink, fontSize: 19, fontWeight: "800", letterSpacing: -0.3 } as TextStyle,
  body: { color: palette.ink, fontSize: 15, lineHeight: 22 } as TextStyle,
  muted: { color: palette.inkSoft, fontSize: 13.5, lineHeight: 20 } as TextStyle,
};

const ui = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    overflow: "hidden",
    marginBottom: space.md,
    ...(shadow.card as object),
  },
  cardPad: { padding: space.lg + 2 },
  cardAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },

  btn: {
    borderRadius: radius.md,
    borderWidth: 1.5,
    minHeight: 52,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  btnInner: { flexDirection: "row", alignItems: "center", gap: space.sm },
  btnText: { fontWeight: "800", fontSize: 15.5, letterSpacing: 0.2 },

  fieldLabel: { color: palette.inkSoft, fontSize: 11, fontWeight: "800", letterSpacing: 0.7, marginBottom: 6 },
  input: {
    backgroundColor: palette.card,
    borderColor: palette.lineStrong,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space.md + 2,
    paddingVertical: 13,
    fontSize: 15.5,
    color: palette.ink,
  },
  fieldHint: { color: palette.faint, fontSize: 12, marginTop: 5 },
  fieldError: { color: palette.danger, fontSize: 12, fontWeight: "600", marginTop: 5 },

  chip: {
    borderWidth: 1.5,
    borderColor: palette.lineStrong,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: palette.card,
  },
  chipText: { color: palette.inkSoft, fontSize: 13, fontWeight: "700" },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  sectionTitle: { color: palette.ink, fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  sectionHint: { color: palette.inkSoft, fontSize: 13, marginTop: 3, lineHeight: 19 },

  divider: { height: 1, backgroundColor: palette.line, marginVertical: space.md },

  note: { flexDirection: "row", gap: space.sm, borderRadius: radius.md, padding: space.md, marginTop: space.md },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "600" },

  empty: { alignItems: "center", paddingVertical: space.xxl, gap: space.sm },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.paperDim,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { color: palette.ink, fontSize: 15.5, fontWeight: "800" },
  emptyBody: { color: palette.inkSoft, fontSize: 13.5, textAlign: "center", lineHeight: 20, maxWidth: 260 },

  kv: { flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 7 },
  kvKey: { color: palette.inkSoft, fontSize: 13.5 },
  kvVal: { color: palette.ink, fontSize: 13.5, fontWeight: "700", flexShrink: 1, textAlign: "right" },
});
