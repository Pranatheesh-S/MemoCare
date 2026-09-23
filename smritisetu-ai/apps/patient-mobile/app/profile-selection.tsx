import React from "react";
import { StyleSheet, View, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../src/components/Text";
import { LanguageToggle } from "../src/components/LanguageToggle";
import { shadow, spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useAppStore } from "../src/store/appStore";

export default function ProfileSelectionScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const patient = useAppStore((state) => state.patient);

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.setupCard}>
        {/* Floating Language Toggle */}
        <View style={styles.languageOverlay}>
          <LanguageToggle compact />
        </View>

        {/* Decorative elements */}
        <Image 
          source={require("../assets/profile_selection_screen_assets/07_floral_corner_bouquet.png")} 
          style={styles.flowerTopLeft} 
        />
        <Image 
          source={require("../assets/profile_selection_screen_assets/06_leaf_sprig.png")} 
          style={styles.leafRightMid} 
        />

        <View style={[styles.setupContent, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
          <Text variant="headingLarge" weight="bold" center color="#0D2C1E" style={{ marginBottom: spacing.xl }}>
            {t("profile.title")}
          </Text>

          <View style={styles.avatarWrapper}>
            <Image 
              source={require("../assets/profile_selection_screen_assets/01_profile_avatar.png")} 
              style={styles.avatarImage} 
              resizeMode="cover" 
            />
          </View>
          
          <Text variant="headingLarge" weight="bold" center color="#0D2C1E" style={{ marginTop: spacing.lg }}>
            {patient?.preferredName ?? ""}
          </Text>
          {patient?.location ? (
            <Text variant="bodyLarge" color="#173D32" center>
              {patient.location}
            </Text>
          ) : null}
        </View>

        <View style={styles.setupFooter}>
          <Image 
            source={require("../assets/profile_selection_screen_assets/07_floral_corner_bouquet.png")} 
            style={styles.flowerBottomLeft} 
          />
          <Image 
            source={require("../assets/profile_selection_screen_assets/06_leaf_sprig.png")} 
            style={styles.flowerBottomRight} 
          />

          <Pressable
            onPress={() => router.replace("/home")}
            accessibilityRole="button"
            accessibilityLabel={t("profile.continue")}
            style={({ pressed }) => [styles.primaryActionBtn, { opacity: pressed ? 0.8 : 1 }]}
          >
            <Text variant="heading" weight="bold" color="#FFFFFF">
              {t("profile.continue")}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF7F8",
    padding: spacing.md,
  },
  setupCard: {
    flex: 1,
    backgroundColor: "#FFFCF5",
    borderRadius: 32,
    overflow: "hidden",
    ...(shadow.card as object),
    position: "relative",
  },
  languageOverlay: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    backgroundColor: "#0D2C1E",
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 2,
    zIndex: 100,
    ...(shadow.raised as object),
  },
  setupContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl * 2,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    alignItems: "center",
  },
  avatarWrapper: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: "hidden",
    borderWidth: 4,
    borderColor: "#FFFCF5",
    ...(shadow.raised as object),
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  setupFooter: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  primaryActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#235C45",
    borderRadius: 40,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    ...(shadow.raised as object),
    zIndex: 10,
  },
  flowerTopLeft: {
    position: "absolute",
    top: -20,
    left: -20,
    width: 140,
    height: 140,
    resizeMode: "contain",
  },
  leafRightMid: {
    position: "absolute",
    right: -20,
    top: "30%",
    width: 100,
    height: 100,
    resizeMode: "contain",
    transform: [{ scaleX: -1 }],
  },
  flowerBottomLeft: {
    position: "absolute",
    bottom: -30,
    left: -30,
    width: 160,
    height: 160,
    resizeMode: "contain",
  },
  flowerBottomRight: {
    position: "absolute",
    bottom: -20,
    right: -20,
    width: 120,
    height: 120,
    resizeMode: "contain",
    transform: [{ scaleX: -1 }],
  },
});
