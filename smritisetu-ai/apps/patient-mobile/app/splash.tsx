import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View, Image } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "../src/components/Text";
import { colors, role } from "../src/theme/colors";
import { radius, spacing, shadow } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useSessionBootstrap } from "../src/session/useSession";
import { useAppStore } from "../src/store/appStore";
import { voiceManager } from "../src/audio/voiceManager";

/**
 * Splash and offline initialisation.
 *
 * The status line reports what is actually happening to the local database
 * rather than showing a spinner that means nothing.
 */
export default function SplashScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const { status, databaseMessageKey } = useSessionBootstrap();
  const phase = useAppStore((state) => state.phase);
  const databaseReady = useAppStore((state) => state.databaseReady);

  useEffect(() => {
    void voiceManager.prepare();
  }, []);

  useEffect(() => {
    if (status !== "READY") return;
    // A brief pause so the status is readable rather than a flash.
    const timer = setTimeout(() => {
      router.replace(phase === "PAIRED" ? "/home" : "/device-pairing");
    }, 900);
    return () => clearTimeout(timer);
  }, [phase, router, status]);

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Image source={require("../assets/splash-icon.png")} style={{ width: 140, height: 140, resizeMode: "contain" }} />
        <Text variant="display" weight="bold" color={colors.deepForest} center>
          {t("app.name")}
        </Text>
        <Text variant="subheading" color={colors.mediumGreen} center>
          {t("app.tagline")}
        </Text>
      </View>

      <View style={styles.status}>
        <ActivityIndicator size="large" color={colors.forest} />
        <Text variant="body" color={role.mutedText} center>
          {status === "READY" && databaseReady ? t("splash.databaseReady") : t(databaseMessageKey)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF7F8",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: spacing.xxxl,
  },
  brand: {
    alignItems: "center",
    gap: spacing.md,
  },
  status: {
    alignItems: "center",
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    minWidth: 260,
    ...(shadow.card as object),
  },
});
