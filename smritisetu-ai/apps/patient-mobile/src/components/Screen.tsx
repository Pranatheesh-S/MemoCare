import React from "react";
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { role } from "../theme/colors";
import { MIN_TOUCH_TARGET, radius, spacing } from "../theme/tokens";
import { Text } from "./Text";
import { SpeakerButton } from "./SpeakerButton";
import { LanguageToggle } from "./LanguageToggle";
import { useTranslation } from "../i18n/useTranslation";
import { greenLeafSprigDecoration, pinkFlowerSprigDecoration } from "../assets/embeddedAssets";

type Props = {
  title?: string;
  children: React.ReactNode;
  onRepeat?: () => void;
  showHome?: boolean;
  onHomePress?: () => void;
  showBack?: boolean;
  onBackPress?: () => void;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
  footer?: React.ReactNode;
};

export function Screen({
  title,
  children,
  onRepeat,
  showHome = true,
  onHomePress,
  showBack = false,
  onBackPress,
  scrollable = false,
  contentStyle,
  footer,
}: Props): React.ReactElement {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();

  const pathname = usePathname();
  const goHome = onHomePress ?? (() => router.replace(pathname.startsWith("/games") ? "/games" : "/home"));
  const goBack = onBackPress ?? (() => (router.canGoBack() ? router.back() : goHome()));

  const body = (
    <View style={[styles.content, contentStyle]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      {/* Fixed Background Decorations */}
      <Image source={greenLeafSprigDecoration} style={styles.bgTopLeft} />
      <Image source={greenLeafSprigDecoration} style={styles.bgTopRight} />
      <Image source={pinkFlowerSprigDecoration} style={styles.bgBottomLeft} />
      <Image source={pinkFlowerSprigDecoration} style={styles.bgBottomRight} />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 16 }]}>
        <View style={styles.headerRow}>
          {showBack ? (
            <IconButton label={t("common.back")} onPress={goBack}>
              <BackIcon />
            </IconButton>
          ) : (
            <LanguageToggle compact />
          )}

          <Text
            variant="title"
            weight="bold"
            color="#FFFFFF"
            center
            style={styles.title}
          >
            {title ?? ""}
          </Text>

          {showHome ? (
            <IconButton label={t("common.home")} onPress={goHome}>
              <HomeIcon />
            </IconButton>
          ) : (
            <View style={styles.iconPlaceholder} />
          )}
        </View>

        {onRepeat ? (
          <View style={styles.repeatRow}>
            <SpeakerButton onPress={onRepeat} label={t("common.repeat")} />
          </View>
        ) : null}
      </View>

      {scrollable ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}

      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View>
      ) : null}
    </View>
  );
}

function IconButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View style={styles.iconCircle}>{children}</View>
      <Text variant="caption" weight="medium" color="#FFFFFF" center style={{marginTop: 4}}>
        {label}
      </Text>
    </Pressable>
  );
}

function HomeIcon(): React.ReactElement {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z"
        stroke="#FFFFFF"
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BackIcon(): React.ReactElement {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 5l-7 7 7 7"
        stroke="#FFFFFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#E2F2E4",
  },
  bgTopLeft: {
    position: "absolute",
    top: 150,
    left: -20,
    width: 100,
    height: 100,
    resizeMode: "contain",
  },
  bgTopRight: {
    position: "absolute",
    top: 180,
    right: -20,
    width: 100,
    height: 100,
    resizeMode: "contain",
    transform: [{ scaleX: -1 }],
  },
  bgBottomLeft: {
    position: "absolute",
    bottom: -20,
    left: -20,
    width: 120,
    height: 120,
    resizeMode: "contain",
  },
  bgBottomRight: {
    position: "absolute",
    bottom: -10,
    right: -30,
    width: 120,
    height: 120,
    resizeMode: "contain",
    transform: [{ scaleX: -1 }],
  },
  header: {
    backgroundColor: "#0D2C1E",
    paddingHorizontal: 24,
    paddingBottom: 24,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    zIndex: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: spacing.xs,
    marginTop: 10,
  },
  iconButton: {
    alignItems: "center",
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  iconPlaceholder: {
    width: 48,
    height: 48,
  },
  repeatRow: {
    marginTop: 20,
    alignItems: "center",
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: "transparent",
  },
});
