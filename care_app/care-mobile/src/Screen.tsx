import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, radius, shadow, space } from "./theme";

export function Screen({
  title,
  eyebrow,
  subtitle,
  right,
  scroll = true,
  children,
}: React.PropsWithChildren<{
  title: string;
  eyebrow?: string;
  subtitle?: string;
  /** Slot at the top-right of the header (e.g. a small action). */
  right?: React.ReactNode;
  scroll?: boolean;
}>) {
  const header = (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.eyebrow}>{(eyebrow || "Remi Care").toUpperCase()}</Text>
        <Text style={s.title}>{title}</Text>
        {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View style={s.right}>{right}</View> : null}
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {header}
          {children}
        </ScrollView>
      ) : (
        <View style={s.page}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function Stat({ value, label, tone = "primary" }: { value: string; label: string; tone?: "primary" | "sand" | "ink" }) {
  const fg = tone === "sand" ? palette.sand : tone === "ink" ? palette.ink : palette.primary;
  return (
    <View style={s.stat}>
      <Text style={[s.statValue, { color: fg }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.paper },
  page: { padding: space.lg, paddingBottom: space.xxl + space.xl },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: space.lg, gap: space.md },
  eyebrow: { color: palette.primary, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.6 },
  title: { color: palette.ink, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, marginTop: 6 },
  subtitle: { color: palette.inkSoft, fontSize: 14.5, lineHeight: 21, marginTop: 6 },
  right: { paddingTop: 4 },
  stat: {
    flex: 1,
    backgroundColor: palette.card,
    borderRadius: radius.lg,
    padding: space.md + 2,
    ...(shadow.card as object),
  },
  statValue: { fontSize: 24, fontWeight: "900", letterSpacing: -0.5 },
  statLabel: { color: palette.inkSoft, fontSize: 12, marginTop: 4, fontWeight: "600" },
});
