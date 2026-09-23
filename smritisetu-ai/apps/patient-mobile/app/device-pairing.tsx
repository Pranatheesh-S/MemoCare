import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View, Image } from "react-native";
import Svg, { Path, Circle, Rect } from "react-native-svg";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../src/components/Text";
import { Button } from "../src/components/Button";
import { SpeakerButton } from "../src/components/SpeakerButton";
import { LanguageToggle } from "../src/components/LanguageToggle";
import { colors, role } from "../src/theme/colors";
import { MIN_TOUCH_TARGET, radius, shadow, spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { DEMO_MODE, DEMO_PAIRING_CODE } from "../src/api/config";
import { pairAndDownload, type PairingStep } from "../src/session/pairingService";
import { useSessionBootstrap } from "../src/session/useSession";
import { assameseCountrysideSunriseBanner, pinkFlowerSprigDecoration, greenLeafSprigDecoration } from "../src/assets/embeddedAssets";

const CODE_LENGTH = 6;

/**
 * Device pairing is a caregiver step.
 *
 * The patient is never asked to log in. They see a hand-off screen, then a
 * family member enters the unique code shown in the caregiver app.
 */
export default function DevicePairingScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("pairing.handoffBody");
  const { reload } = useSessionBootstrap();

  const [gate, setGate] = useState<"HANDOFF" | "CAREGIVER">("HANDOFF");
  const [letterMode, setLetterMode] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<PairingStep>("IDLE");
  const [messageKey, setMessageKey] = useState<string | null>(null);

  const busy = step === "CONNECTING" || step === "DOWNLOADING" || step === "SAVING";
  const complete = step === "COMPLETE";

  const digits = useMemo(() => ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"], []);

  useEffect(() => {
    void speak("pairing.handoffBody");
    // Spoken once when the hand-off screen first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCaregiverPad = useCallback(() => {
    setGate("CAREGIVER");
    void speak("pairing.instruction");
  }, [speak]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH) return;
      setMessageKey(null);

      const result = await pairAndDownload(value, (progress) => {
        setStep(progress.step);
        setMessageKey(progress.messageKey);
      });

      if (result.ok) {
        await reload();
        setStep("COMPLETE");
        setMessageKey("pairing.successBody");
        void speak("pairing.successBody");
      } else {
        setStep("FAILED");
        setMessageKey(result.errorKey);
        setCode("");
        void speak(result.errorKey);
      }
    },
    [reload, speak],
  );

  const press = useCallback(
    (digit: string) => {
      if (busy || complete) return;
      if (digit === "⌫") {
        setCode((current) => current.slice(0, -1));
        return;
      }
      if (digit === "") return;

      setCode((current) => {
        const next = (current + digit).slice(0, CODE_LENGTH);
        if (next.length === CODE_LENGTH) void submit(next);
        return next;
      });
    },
    [busy, complete, submit],
  );

  if (complete) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.setupCard}>
          {/* Floating Language Toggle */}
          <View style={styles.languageOverlay}>
            <LanguageToggle compact />
          </View>

          {/* Decorative elements */}
          <Image source={pinkFlowerSprigDecoration} style={styles.flowerTopLeft} />
          <Image source={greenLeafSprigDecoration} style={styles.leafRightMid} />

          <View style={[styles.setupContent, { flex: 1, justifyContent: "center", alignItems: "center" }]}>
            <View style={[styles.shieldIconWrapper, { width: 80, height: 80, borderRadius: 40 }]}>
              <Text variant="display" center>
                🎉
              </Text>
            </View>
            <Text variant="headingLarge" weight="bold" center color="#0D2C1E" style={{ marginTop: spacing.lg }}>
              {t("pairing.successTitle")}
            </Text>
            <Text variant="bodyLarge" color="#173D32" center>
              {t("pairing.successBody")}
            </Text>
          </View>

          <View style={styles.setupFooter}>
            <Image source={pinkFlowerSprigDecoration} style={styles.flowerBottomLeft} />
            <Image source={greenLeafSprigDecoration} style={styles.flowerBottomRight} />

            <Pressable
              onPress={() => router.replace("/profile-selection")}
              accessibilityRole="button"
              accessibilityLabel={t("pairing.successAction")}
              style={({ pressed }) => [styles.primaryActionBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Text variant="heading" weight="bold" color="#FFFFFF">
                {t("pairing.successAction")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (gate === "HANDOFF") {
    return (
      <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
        <View style={styles.setupCard}>
          <View style={styles.heroContainer}>
            <Image 
              source={require("../assets/setup-family-illustration.png")} 
              style={styles.heroImage} 
              resizeMode="cover" 
            />
            <View style={styles.languageOverlay}>
              <LanguageToggle compact />
            </View>
            <Image source={pinkFlowerSprigDecoration} style={styles.flowerTopLeft} />
          </View>
          
          <View style={styles.setupContent}>
            <Text variant="headingLarge" weight="bold" center color="#0D2C1E" style={styles.handoffTitle}>
              {t("pairing.handoffTitle")}
            </Text>
            
            <Image source={greenLeafSprigDecoration} style={styles.leafRightMid} />
            <Image source={pinkFlowerSprigDecoration} style={styles.flowerLeftMid} />

            <View style={styles.infoBanner}>
              <View style={styles.shieldIconWrapper}>
                <ShieldPeopleIcon />
              </View>
              <Text variant="body" color="#173D32" style={styles.infoText}>
                {t("pairing.handoffBody")}
              </Text>
            </View>

            <Pressable
              onPress={repeat}
              accessibilityRole="button"
              accessibilityLabel={t("common.repeat")}
              style={({ pressed }) => [styles.repeatPill, { opacity: pressed ? 0.7 : 1 }]}
            >
              <SpeakerIcon color="#235C45" />
              <Text variant="bodyLarge" weight="bold" color="#235C45">
                {t("common.repeat")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.setupFooter}>
            <Image source={pinkFlowerSprigDecoration} style={styles.flowerBottomLeft} />
            <Image source={greenLeafSprigDecoration} style={styles.flowerBottomRight} />

            <Pressable 
              onPress={() => router.push("/settings")} 
              accessibilityRole="button"
              accessibilityLabel={t("common.settings")}
              style={({ pressed }) => [styles.floatingSettings, { opacity: pressed ? 0.7 : 1 }]}
            >
              <GearIcon color="#235C45" />
            </Pressable>

            <Pressable
              onPress={openCaregiverPad}
              accessibilityRole="button"
              accessibilityLabel={t("pairing.handoffAction")}
              style={({ pressed }) => [styles.primaryActionBtn, { opacity: pressed ? 0.8 : 1 }]}
            >
              <PeopleIcon color="#FFFFFF" />
              <Text variant="heading" weight="bold" color="#FFFFFF">
                {t("pairing.handoffAction")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.setupCard}>
        {/* Floating Language Toggle */}
        <View style={styles.languageOverlay}>
          <LanguageToggle compact />
        </View>

        {/* Decorative elements */}
        <Image source={pinkFlowerSprigDecoration} style={styles.flowerMidLeftEdge} />

        <View style={[styles.setupContent, { flex: 1, justifyContent: "flex-start", paddingTop: spacing.xl * 1.5 }]}>
          <Text variant="bodyLarge" weight="bold" color="#0D2C1E" center>
            {t("pairing.caregiverOnly")}
          </Text>
          <Text variant="headingLarge" weight="bold" center color="#0D2C1E" style={{ marginVertical: spacing.xs }}>
            {t("pairing.title")}
          </Text>
          <Text variant="bodyLarge" color="#0D2C1E" center style={{ marginBottom: spacing.lg }}>
            {t("pairing.instruction")}
          </Text>

          <Pressable
            onPress={repeat}
            accessibilityRole="button"
            accessibilityLabel={t("common.repeat")}
            style={({ pressed }) => [styles.repeatPillDark, { opacity: pressed ? 0.8 : 1 }]}
          >
            <SpeakerIcon color="#FFFFFF" />
            <Text variant="bodyLarge" weight="bold" color="#FFFFFF">
              {t("common.repeat")}
            </Text>
          </Pressable>

          <View style={styles.codeRow} accessibilityLabel={t("pairing.codeLabel")}>
            {Array.from({ length: CODE_LENGTH }).map((_, index) => (
              <View key={index} style={[styles.codeBoxBase, code[index] ? styles.codeBoxFilledNew : null]}>
                <Text variant="heading" weight="bold" center color="#0D2C1E">
                  {code[index] ?? ""}
                </Text>
              </View>
            ))}
          </View>

          {messageKey ? (
            <Text
              variant="body"
              center
              color={step === "FAILED" ? colors.emergency : "#0D2C1E"}
              style={styles.message}
            >
              {t(messageKey)}
            </Text>
          ) : null}

          {letterMode ? (
            <View style={styles.letterEntry}>
              <TextInput
                value={code}
                onChangeText={(value) =>
                  setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH))
                }
                autoCapitalize="characters"
                autoCorrect={false}
                editable={!busy && !complete}
                maxLength={CODE_LENGTH}
                placeholder="ABC234"
                placeholderTextColor={role.mutedText}
                style={styles.letterInput}
                accessibilityLabel={t("pairing.codeLabel")}
              />
              <Button
                label={t("pairing.handoffAction")}
                loading={busy}
                onPress={() => void submit(code)}
              />
            </View>
          ) : (
            <View style={styles.keypadWrapper}>
              <View style={styles.keypad}>
                {digits.map((digit, index) => (
                  <Pressable
                    key={`${digit}-${index}`}
                    onPress={() => press(digit)}
                    disabled={digit === "" || busy}
                    accessibilityRole="button"
                    accessibilityLabel={digit === "⌫" ? t("common.back") : digit}
                    style={({ pressed }) => [
                      styles.keyBase,
                      digit === "" ? styles.keyHidden : null,
                      { opacity: pressed ? 0.7 : busy ? 0.5 : 1 },
                    ]}
                  >
                    {digit === "⌫" ? (
                      <BackspaceIcon color="#0D2C1E" />
                    ) : (
                      <Text variant="headingLarge" weight="bold" center color="#0D2C1E">
                        {digit}
                      </Text>
                    )}
                  </Pressable>
                ))}
              </View>
              <Pressable 
                onPress={() => router.push("/settings")} 
                accessibilityRole="button"
                accessibilityLabel={t("common.settings")}
                style={({ pressed }) => [styles.floatingSettingsMiddle, { opacity: pressed ? 0.7 : 1 }]}
              >
                <GearIcon color="#888888" />
              </Pressable>
            </View>
          )}

          <Pressable
            onPress={() => {
              setLetterMode((on) => !on);
              setCode("");
              setMessageKey(null);
            }}
            disabled={busy}
            style={styles.modeToggle}
          >
            <Text variant="bodyLarge" weight="bold" color="#0D2C1E" center>
              {letterMode ? t("pairing.useNumberPad") : t("pairing.useLetterCode")}
            </Text>
          </Pressable>

          {DEMO_MODE ? (
            <Pressable
              disabled={busy}
              onPress={() => {
                setCode(DEMO_PAIRING_CODE);
                void submit(DEMO_PAIRING_CODE);
              }}
              style={({ pressed }) => [styles.demoButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              <Text variant="bodyLarge" weight="bold" color="#0D2C1E">
                {t("pairing.demoMode")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function ShieldPeopleIcon(): React.ReactElement {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"
        stroke="#235C45"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={10} r={2} stroke="#235C45" strokeWidth={2} />
      <Path d="M7 16c1-2 3-3 5-3s4 1 5 3" stroke="#235C45" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function SpeakerIcon({ color }: { color: string }): React.ReactElement {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 5L6 9H2v6h4l5 4V5z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GearIcon({ color }: { color: string }): React.ReactElement {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15a3 3 0 100-6 3 3 0 000 6z"
        stroke={color}
        strokeWidth={2}
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PeopleIcon({ color }: { color: string }): React.ReactElement {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path
        d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={9} cy={7} r={4} stroke={color} strokeWidth={2} />
      <Path
        d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function BackspaceIcon({ color }: { color: string }): React.ReactElement {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M18 9l-6 6M12 9l6 6"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
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
  heroContainer: {
    width: "100%",
    height: 320,
    position: "relative",
  },
  heroImage: {
    width: "100%",
    height: "100%",
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.lg,
    alignItems: "center",
  },
  handoffTitle: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    lineHeight: 38,
  },
  infoBanner: {
    flexDirection: "row",
    backgroundColor: "#EAF2E3",
    borderRadius: 16,
    padding: spacing.md,
    alignItems: "center",
    gap: spacing.sm,
    width: "100%",
    ...(shadow.small as object),
  },
  shieldIconWrapper: {
    width: 40,
    height: 40,
    backgroundColor: "rgba(35,92,69,0.1)",
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: {
    flex: 1,
    fontWeight: "500",
  },
  repeatPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF2E3",
    borderRadius: 30,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    ...(shadow.small as object),
  },
  setupFooter: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  floatingSettings: {
    alignSelf: "flex-end",
    backgroundColor: "#FFF8ED",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    marginRight: spacing.sm,
    ...(shadow.raised as object),
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
  },
  flowerTopLeft: {
    position: "absolute",
    top: 20,
    left: -20,
    width: 100,
    height: 100,
    resizeMode: "contain",
  },
  flowerLeftMid: {
    position: "absolute",
    left: -30,
    top: 60,
    width: 80,
    height: 80,
    resizeMode: "contain",
  },
  leafRightMid: {
    position: "absolute",
    right: -20,
    top: 10,
    width: 120,
    height: 120,
    resizeMode: "contain",
    transform: [{ scaleX: -1 }],
  },
  flowerBottomLeft: {
    position: "absolute",
    bottom: -10,
    left: -30,
    width: 120,
    height: 120,
    resizeMode: "contain",
  },
  flowerBottomRight: {
    position: "absolute",
    bottom: -10,
    right: -30,
    width: 120,
    height: 120,
    resizeMode: "contain",
    transform: [{ scaleX: -1 }],
  },
  flowerMidLeftEdge: {
    position: "absolute",
    left: -20,
    top: 200,
    width: 60,
    height: 100,
    resizeMode: "contain",
  },
  repeatPillDark: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#235C45",
    borderRadius: 30,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
    marginBottom: spacing.md,
    width: "100%",
    ...(shadow.small as object),
  },
  codeRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  codeBoxBase: {
    width: 48,
    height: 64,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: "#89B89D",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  codeBoxFilledNew: {
    borderColor: "#235C45",
  },
  keypadWrapper: {
    position: "relative",
    width: "100%",
    paddingRight: 50,
    paddingLeft: 10,
  },
  keypad: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
  keyBase: {
    width: "30%",
    height: 60,
    borderRadius: radius.md,
    backgroundColor: "#FFF8ED",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    ...(shadow.small as object),
  },
  keyHidden: {
    backgroundColor: "transparent",
    borderWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  letterEntry: {
    gap: spacing.md,
    paddingHorizontal: spacing.md,
  },
  letterInput: {
    borderWidth: 2,
    borderColor: colors.sage,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    textAlign: "center",
    fontSize: 34,
    letterSpacing: 10,
    fontWeight: "700",
    color: role.bodyText,
  },
  floatingSettingsMiddle: {
    position: "absolute",
    right: 0,
    top: "50%",
    marginTop: -24,
    backgroundColor: "#E5E7EB",
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    ...(shadow.small as object),
  },
  modeToggle: {
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  demoButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 30,
    paddingVertical: spacing.md,
    borderWidth: 2,
    borderColor: "#235C45",
    alignItems: "center",
    width: "100%",
    ...(shadow.small as object),
  },
  successBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
});
