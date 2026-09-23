import React, { useCallback, useEffect, useMemo, useState, forwardRef } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
  type ViewProps,
  type ImageSourcePropType,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { Text } from "../src/components/Text";
import { SpeakerButton } from "../src/components/SpeakerButton";
import { LanguageToggle } from "../src/components/LanguageToggle";
import { colors } from "../src/theme/colors";
import { shadow, spacing } from "../src/theme/tokens";
import { useTranslation } from "../src/i18n/useTranslation";
import { greetingKeyForHour } from "../src/i18n/translate";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { useAppStore } from "../src/store/appStore";
import { useSyncEngine } from "../src/sync/useSync";
import { formatDayAndDate, formatRelative, formatTime } from "../src/utils/datetime";
import { useSpotlightTarget } from "../src/components/SpotlightTarget";
import { useSpotlightStore } from "../src/store/spotlightStore";
import { reminderManager, type TimelineItem } from "../src/notifications/reminderManager";
import { notificationService } from "../src/notifications/notificationService";
import { refreshOfflinePackage } from "../src/session/pairingService";
import { glossyPuzzlePieceTrioWithCelebrationRays, assameseCountrysideSunriseBanner, soft3DWhiteStopHandIcon, cheerfulWavingRobotMascot, joyfulGrandmotherInASaree, glossyMintCallAndHeartIcon, glossyHeartMemoriesPhotoStack, cuteCalendarCoffeeAndPlantSet } from "../src/assets/embeddedAssets";

/** Spoken once per app session so returning Home does not greet again. */
let homeCueSpokenThisSession = false;

const PAGE_HORIZONTAL = 18;
const GRID_GAP = 14;
const MAX_CONTENT_WIDTH = 560;

function ChevronRightIcon({ color = "#173D32" }: { color?: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SettingsIcon(): React.ReactElement {
  return (
    <Svg width={25} height={25} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
        stroke={colors.sage}
        strokeWidth={2}
      />
      <Path
        d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 008 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
        stroke={colors.sage}
        strokeWidth={1.6}
      />
    </Svg>
  );
}

export interface HomeActionCardProps extends ViewProps {
  testID?: string;
  title: string;
  subtitle?: string;
  bgColor: string;
  arrowBgColor: string;
  arrowIconColor?: string;
  imageSource: ImageSourcePropType;
  onPress: () => void;
  width: number;
  height: number;
}

const HomeActionCard = forwardRef<View, HomeActionCardProps>(({
  testID,
  title,
  subtitle,
  bgColor,
  arrowBgColor,
  arrowIconColor = "#173D32",
  imageSource,
  onPress,
  width,
  height,
  ...rest
}, ref) => {
  return (
    <Pressable
      ref={ref as any}
      collapsable={false}
      testID={testID}
      {...rest}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({ pressed }) => [
        styles.actionCard,
        shadow.card as ViewStyle,
        {
          width,
          height,
          backgroundColor: bgColor,
          opacity: pressed ? 0.94 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      <View pointerEvents="none" style={styles.cardArtArea}>
        <Image
          source={imageSource}
          style={styles.cardImage}
          resizeMode="contain"
        />
      </View>

      <View style={styles.cardTextContainer}>
        <Text
          variant="bodyLarge"
          weight="bold"
          color="#173D32"
          numberOfLines={2}
          style={styles.cardTitle}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="caption"
            color="#5B756B"
            numberOfLines={2}
            style={styles.cardSubtitle}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      <View style={[styles.cardArrow, { backgroundColor: arrowBgColor }]}>
        <ChevronRightIcon color={arrowIconColor} />
      </View>
    </Pressable>
  );
});

/**
 * Patient home screen.
 * Responsive two-column layout tuned to match the supplied glossy pastel UI.
 */
export default function HomeScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { t, language } = useTranslation();
  const greetingKey = useMemo(() => greetingKeyForHour(new Date().getHours()), []);
  const { speak } = useVoiceGuidance("home.choose");

  const patient = useAppStore((state) => state.patient);
  const patientId = useAppStore((state) => state.patientId);
  const deviceId = useAppStore((state) => state.deviceId);
  const isOnline = useAppStore((state) => state.isOnline);
  const lastSyncAt = useAppStore((state) => state.lastSyncAt);
  const recommendedGame = useAppStore((state) => state.recommendedGame);
  const triggerSpotlight = useSpotlightStore((state) => state.triggerSpotlight);
  const activeSpotlightId = useSpotlightStore((state) => state.activeTargetId);

  const [nextUp, setNextUp] = useState<TimelineItem | null>(null);

  useSyncEngine(Boolean(patientId && deviceId));

  const greeting = t(greetingKey, { name: patient?.preferredName ?? "" });

  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH);
  const gridAvailableWidth = contentWidth - PAGE_HORIZONTAL * 2;
  const cardWidth = Math.floor((gridAvailableWidth - GRID_GAP) / 2);
  const cardHeight = Math.round(
    Math.max(148, Math.min(168, cardWidth * 0.84)),
  );

  const labelFor = useCallback(
    (item: { titleEn: string; titleAs?: string; kind: string }) => ({
      title: language === "as" && item.titleAs ? item.titleAs : item.titleEn,
      body: t(`myDay.kind.${item.kind}`),
    }),
    [language, t],
  );

  const speakHomeCue = useCallback(
    (force: boolean) => {
      if (nextUp) {
        void speak(
          "home.nextRoutine",
          {
            title:
              language === "as" && nextUp.titleAs
                ? nextUp.titleAs
                : nextUp.titleEn,
            time: formatTime(nextUp.dueAt),
          },
          force,
        );
        return;
      }

      void speak("home.choose", undefined, force);
    },
    [language, nextUp, speak],
  );

  useFocusEffect(
    useCallback(() => {
      if (!patientId || !deviceId) return;
      let cancelled = false;

      void (async () => {
        await notificationService.ensurePermissions();
        const timeline = await reminderManager.rebuild(
          patientId,
          deviceId,
          language,
          labelFor,
        );
        if (cancelled) return;

        const next = (reminderManager.nextUp(timeline) as TimelineItem) ?? null;
        setNextUp(next);

        if (!homeCueSpokenThisSession) {
          homeCueSpokenThisSession = true;

          if (next) {
            void speak("home.nextRoutine", {
              title:
                language === "as" && next.titleAs
                  ? next.titleAs
                  : next.titleEn,
              time: formatTime(next.dueAt),
            });
          } else {
            void speak("home.choose");
          }
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [deviceId, labelFor, language, patientId, speak]),
  );

  useEffect(() => {
    if (!patientId || !isOnline) return;
    void refreshOfflinePackage(patientId, language);
  }, [isOnline, language, patientId]);

  const lastSync = formatRelative(lastSyncAt);

  return (
    <View style={styles.root}>
      <Image
        source={assameseCountrysideSunriseBanner}
        style={styles.backgroundImage}
        resizeMode="cover"
      />

      <View
        style={[
          styles.screenColumn,
          { width: contentWidth, alignSelf: "center" },
        ]}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) }]}>
          <View style={styles.toolbar}>
            <View style={styles.headerPill}>
              <LanguageToggle compact />
            </View>

            <View style={styles.toolbarRight}>
              <View style={styles.headerIconButton}>
                <SpeakerButton
                  compact
                  onPress={() => void speakHomeCue(true)}
                  label={t("common.repeat")}
                  testID="home-speaker"
                />
              </View>

              <Pressable
                onPress={() => triggerSpotlight("call-family", "Tap here to call your family for help.")}
                accessibilityRole="button"
                style={({ pressed }) => [
                  { 
                    opacity: pressed ? 0.75 : 1, 
                    backgroundColor: "#FFD1D1", 
                    marginRight: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 20,
                    justifyContent: "center",
                  },
                ]}
              >
                <Text variant="caption" weight="bold" color="#B81D13">Feeling Lost?</Text>
              </Pressable>

              <Pressable
                onPress={() => router.push("/settings")}
                accessibilityRole="button"
                accessibilityLabel={t("common.settings")}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.headerIconButton,
                  styles.settingsBtn,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <SettingsIcon />
              </Pressable>
            </View>
          </View>

          <View style={styles.identity}>
            <View style={styles.avatarContainer}>
              <Image
                source={
                  patient?.photoUrl
                    ? { uri: patient.photoUrl }
                    : joyfulGrandmotherInASaree
                }
                style={styles.avatarImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.greetingBlock}>
              <Text
                variant="heading"
                weight="bold"
                color="#113328"
                style={styles.greetingText}
              >
                {greeting.split(",").join(",\n")}
              </Text>

              <Text variant="caption" color="#39584D" style={styles.dateText}>
                {formatDayAndDate()}
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/sync-status")}
            accessibilityRole="button"
            accessibilityLabel={t("sync.title")}
            style={styles.syncRow}
          >
            <View style={styles.syncContainer}>
              <View
                style={[
                  styles.syncStatusBadge,
                  isOnline ? styles.syncOnline : styles.syncOffline,
                ]}
              >
                <View
                  style={[
                    styles.syncDot,
                    isOnline ? styles.syncDotOnline : styles.syncDotOffline,
                  ]}
                />
                <Text
                  variant="caption"
                  weight="bold"
                  color={isOnline ? "#FFFFFF" : "#113328"}
                  numberOfLines={1}
                >
                  {isOnline ? t("home.online") : t("home.offline")}
                </Text>
              </View>

              <View style={styles.syncTimeBadge}>
                <Text
                  variant="caption"
                  color="#5C766C"
                  numberOfLines={1}
                  style={styles.syncTimeText}
                >
                  {lastSync
                    ? t("home.lastSync", { time: lastSync })
                    : t("home.neverSynced")}
                </Text>
              </View>
            </View>
          </Pressable>
        </View>

        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={[
            styles.body,
            { paddingBottom: Math.max(insets.bottom, 24) + 116 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            testID="home-companion"
            onPress={() => router.push("/talk-companion")}
            accessibilityRole="button"
            accessibilityLabel={t("home.talkCompanion")}
            style={({ pressed }) => [
              styles.companionCard,
              shadow.card as ViewStyle,
              {
                opacity: pressed ? 0.95 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            <View style={styles.companionBadge}>
              <Text
                variant="caption"
                weight="bold"
                color="#6D28D9"
                style={styles.companionBadgeText}
              >
                ✨ {language === "as" ? "মৰমৰ সংগী" : "AI Companion"}
              </Text>
            </View>

            <View style={styles.companionTextCol}>
              <Text
                variant="title"
                weight="bold"
                color="#173D32"
                numberOfLines={2}
                style={styles.companionTitle}
              >
                {t("home.talkCompanion")}
              </Text>

              <Text
                variant="caption"
                color="#5C766C"
                numberOfLines={2}
                style={styles.companionSubtitle}
              >
                {language === "as"
                  ? "কথা পাতিবলৈ এজন শান্ত বন্ধু"
                  : "A calm, gentle friend to chat with"}
              </Text>
            </View>

            <Image
              source={cheerfulWavingRobotMascot}
              style={styles.robotImage}
              resizeMode="contain"
            />
          </Pressable>

          <View style={styles.grid}>
            <HomeActionCard
              testID="home-games"
              title={t("home.playGames")}
              subtitle={
                language === "as" ? "মনটো সক্ৰিয় ৰাখক" : "Keep your mind active"
              }
              bgColor="#FFF3CF"
              arrowBgColor="#F8C93D"
              imageSource={glossyPuzzlePieceTrioWithCelebrationRays}
              onPress={() => router.push("/games")}
              width={cardWidth}
              height={cardHeight}
            />

            <HomeActionCard
              testID="home-my-day"
              title={t("home.myDay")}
              subtitle={
                language === "as" ? "আজিৰ পৰিকল্পনা চাওক" : "See today’s plan"
              }
              bgColor="#EEE8F8"
              arrowBgColor="#C9B8FA"
              imageSource={cuteCalendarCoffeeAndPlantSet}
              onPress={() => router.push("/my-day")}
              width={cardWidth}
              height={cardHeight}
            />

            <HomeActionCard
              testID="home-memories"
              title={t("home.myMemories")}
              subtitle={
                language === "as" ? "সুখৰ স্মৃতি ঘূৰাই আনক" : "Relive happy"
              }
              bgColor="#F9E2EA"
              arrowBgColor="#F3A6C8"
              imageSource={glossyHeartMemoriesPhotoStack}
              onPress={() => router.push("/my-memories")}
              width={cardWidth}
              height={cardHeight}
            />

            <HomeActionCard
              testID="home-call-family"
              title={t("home.callFamily")}
              subtitle={
                language === "as"
                  ? "আপোনজনৰ সৈতে কথা পাতক"
                  : "Talk to your loved ones"
              }
              bgColor="#DCF2E6"
              arrowBgColor="#6DDFAB"
              imageSource={glossyMintCallAndHeartIcon}
              onPress={() => {
                if (activeSpotlightId === "call-family") {
                  triggerSpotlight("contact-Bhaskar", "Tap here to call Bhaskar.");
                }
                router.push("/call-family");
              }}
              width={cardWidth}
              height={cardHeight}
              ref={useSpotlightTarget("call-family")}
            />
          </View>

          <Pressable
            onPress={() => router.push("/my-day")}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.nextCard,
              shadow.card as ViewStyle,
              {
                opacity: pressed ? 0.95 : 1,
                transform: [{ scale: pressed ? 0.985 : 1 }],
              },
            ]}
          >
            <View style={styles.bulbIconContainer}>
              <Text style={styles.bulbEmoji}>💡</Text>
            </View>

            <View style={styles.nextTextCol}>
              <Text
                variant="body"
                weight="bold"
                color="#173D32"
                numberOfLines={2}
              >
                {nextUp
                  ? t("home.nextRoutine", {
                      title:
                        language === "as" && nextUp.titleAs
                          ? nextUp.titleAs
                          : nextUp.titleEn,
                      time: formatTime(nextUp.dueAt),
                    })
                  : t("home.noNextRoutine")}
              </Text>

              <Text
                variant="caption"
                color="#5C766C"
                numberOfLines={2}
                style={styles.nextSubtitle}
              >
                {t("home.recommended", {
                  activity: t(gameLabelKey(recommendedGame)),
                })}
              </Text>
            </View>

            <ChevronRightIcon color="#173D32" />
          </Pressable>
        </ScrollView>
      </View>

      <View
        style={[
          styles.floatingFooter,
          {
            bottom: Math.max(insets.bottom, spacing.md),
            maxWidth: contentWidth - PAGE_HORIZONTAL * 2,
          },
        ]}
      >
        <Pressable
          testID="home-help"
          onPress={() => router.push("/help")}
          accessibilityRole="button"
          accessibilityLabel={t("home.needHelp")}
          style={({ pressed }) => [
            styles.helpButton,
            shadow.raised as ViewStyle,
            { opacity: pressed ? 0.86 : 1 },
          ]}
        >
          <Image
            source={soft3DWhiteStopHandIcon}
            style={styles.helpIcon}
            resizeMode="contain"
          />
          <Text
            variant="button"
            weight="bold"
            color="#FFFFFF"
            style={styles.helpLabel}
          >
            {t("home.needHelp")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function gameLabelKey(gameType: string): string {
  const keys: Record<string, string> = {
    MEMORY_MATCH: "games.memoryMatch",
    ROUTINE_BUILDER: "games.routineBuilder",
    WHO_IS_THIS: "games.whoIsThis",
    MEMORY_LANE: "games.memoryLane",
  };

  return keys[gameType] ?? "games.memoryMatch";
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#EFF7F8",
  },

  screenColumn: {
    flex: 1,
  },

  backgroundImage: {
    position: "absolute",
    top: -22,
    left: 0,
    width: "100%",
    height: 530,
  },

  header: {
    paddingHorizontal: PAGE_HORIZONTAL,
    paddingBottom: 12,
    gap: 12,
  },

  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  headerPill: {
    backgroundColor: "#FFF8ED",
    borderRadius: 24,
    paddingHorizontal: 4,
    paddingVertical: 2,
    ...(shadow.small as object),
  },

  toolbarRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  headerIconButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFF8ED",
    alignItems: "center",
    justifyContent: "center",
    ...(shadow.small as object),
  },

  settingsBtn: {
    backgroundColor: "rgba(255,248,237,0.92)",
  },

  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 4,
  },

  avatarContainer: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 3,
    borderColor: "#F4C83F",
    padding: 3,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    ...(shadow.small as object),
  },

  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },

  greetingBlock: {
    flex: 1,
    justifyContent: "center",
    minWidth: 0,
  },

  greetingText: {
    fontSize: 27,
    lineHeight: 31,
    letterSpacing: -0.45,
  },

  dateText: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 19,
  },

  syncRow: {
    width: "100%",
    marginTop: 2,
  },

  syncContainer: {
    width: "100%",
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,248,237,0.96)",
    borderRadius: 24,
    overflow: "hidden",
    ...(shadow.small as object),
  },

  syncStatusBadge: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderRadius: 24,
    gap: 7,
  },

  syncOnline: {
    backgroundColor: "#163E33",
  },

  syncOffline: {
    backgroundColor: "#E3E8E5",
  },

  syncDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },

  syncDotOnline: {
    backgroundColor: "#39E2A0",
  },

  syncDotOffline: {
    backgroundColor: "#94A3B8",
  },

  syncTimeBadge: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 14,
  },

  syncTimeText: {
    fontSize: 13.5,
  },

  bodyScroll: {
    flex: 1,
  },

  body: {
    paddingHorizontal: PAGE_HORIZONTAL,
    paddingTop: 2,
    gap: 14,
  },

  companionCard: {
    position: "relative",
    minHeight: 132,
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: "#FBEFF6",
    overflow: "hidden",
  },

  companionBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 13,
    backgroundColor: "#F1E6FF",
  },

  companionBadgeText: {
    fontSize: 10.5,
    lineHeight: 13,
  },

  companionTextCol: {
    width: "70%",
    minWidth: 0,
    paddingTop: 10,
    zIndex: 2,
  },

  companionTitle: {
    fontSize: 20,
    lineHeight: 24,
  },

  companionSubtitle: {
    marginTop: 6,
    fontSize: 14.5,
    lineHeight: 19,
  },

  robotImage: {
    position: "absolute",
    right: 4,
    bottom: -4,
    width: 118,
    height: 118,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: GRID_GAP,
  },

  actionCard: {
    position: "relative",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 13,
    overflow: "hidden",
  },

  cardArtArea: {
    width: "100%",
    height: 68,
    alignItems: "flex-end",
    justifyContent: "center",
  },

  cardImage: {
    width: 92,
    height: 92,
    marginTop: -4,
    marginRight: -2,
  },

  cardTextContainer: {
    marginTop: "auto",
    paddingRight: 38,
    minWidth: 0,
    zIndex: 2,
  },

  cardTitle: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.25,
  },

  cardSubtitle: {
    marginTop: 4,
    fontSize: 16,
    lineHeight: 20,
  },

  cardArrow: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },

  nextCard: {
    minHeight: 78,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 21,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },

  bulbIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFF8DB",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  bulbEmoji: {
    fontSize: 22,
    textAlign: "center",
  },

  nextTextCol: {
    flex: 1,
    minWidth: 0,
  },

  nextSubtitle: {
    marginTop: 3,
    lineHeight: 17,
  },

  floatingFooter: {
    position: "absolute",
    left: PAGE_HORIZONTAL,
    right: PAGE_HORIZONTAL,
    alignSelf: "center",
    zIndex: 20,
  },

  helpButton: {
    height: 58,
    borderRadius: 29,
    backgroundColor: "#E32626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  helpIcon: {
    width: 29,
    height: 29,
    tintColor: "#FFFFFF",
  },

  helpLabel: {
    fontSize: 19,
    lineHeight: 22,
  },
});
