import React, { useCallback, useState } from "react";
import { StyleSheet, View, Image, Pressable, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { Text } from "../src/components/Text";
import { EmptyState } from "../src/components/EmptyState";
import { Illustration } from "../src/games/illustrationMap";
import { useTranslation } from "../src/i18n/useTranslation";
import { useVoiceGuidance } from "../src/audio/useVoiceGuidance";
import { useAppStore } from "../src/store/appStore";
import { formatDayAndDate, formatTime } from "../src/utils/datetime";
import { reminderManager, type TimelineItem } from "../src/notifications/reminderManager";
import { notificationService, type PermissionState } from "../src/notifications/notificationService";
import { isOutstanding, stateMessageKey } from "../src/notifications/reminderState";
import { SpeakerButton } from "../src/components/SpeakerButton";
import { greenLeafSprigDecoration, lunchMealIcon, doneCheckIcon, morningTabletIcon, drinkWaterIcon, pinkFlowerSprigDecoration, remindMeAgainIcon, helpLifebuoyIcon, reminderFlowerIcon } from "../src/assets/embeddedAssets";

const KIND_ILLUSTRATION: Record<string, any> = {
  MEDICINE: morningTabletIcon,
  HYDRATION: drinkWaterIcon,
  MEAL: lunchMealIcon,
  EXERCISE: morningTabletIcon,
  APPOINTMENT: lunchMealIcon,
  SLEEP: drinkWaterIcon,
  FAMILY_CHECK_IN: morningTabletIcon,
};

function HomeIcon(): React.ReactElement {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1v-9z"
        stroke="#FFF"
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
        stroke="#FFF"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function MyDayScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, language } = useTranslation();
  const { speak, repeat } = useVoiceGuidance("myDay.title");
  const patientId = useAppStore((state) => state.patientId);
  const deviceId = useAppStore((state) => state.deviceId);

  const [timeline, setTimeline] = useState<TimelineItem[] | null>(null);
  const [permission, setPermission] = useState<PermissionState>("granted");

  const labelFor = useCallback(
    (item: { titleEn: string; titleAs?: string; kind: string }) => ({
      title: language === "as" && item.titleAs ? item.titleAs : item.titleEn,
      body: t(`myDay.kind.${item.kind}`),
    }),
    [language, t],
  );

  const load = useCallback(async () => {
    if (!patientId || !deviceId) return;
    setPermission(await notificationService.ensurePermissions());
    setTimeline(await reminderManager.rebuild(patientId, deviceId, language, labelFor));
  }, [deviceId, labelFor, language, patientId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onDone = useCallback(
    async (item: TimelineItem) => {
      if (!patientId || !deviceId) return;
      await reminderManager.acknowledge(item, patientId, deviceId);
      void speak("games.doingWell");
      await load();
    },
    [deviceId, load, patientId, speak],
  );

  const onSnooze = useCallback(
    async (item: TimelineItem) => {
      if (!patientId || !deviceId) return;
      await reminderManager.snooze(item, patientId, deviceId, labelFor, language);
      void speak("myDay.snoozed");
      await load();
    },
    [deviceId, labelFor, language, load, patientId, speak],
  );

  const onHelp = useCallback(
    async (item: TimelineItem) => {
      if (!patientId || !deviceId) return;
      await reminderManager.requestHelp(item, patientId, deviceId);
      router.push("/help");
    },
    [deviceId, patientId, router],
  );

  return (
    <View style={styles.root}>
      <Image source={greenLeafSprigDecoration} style={styles.bgTopLeft} />
      <Image source={greenLeafSprigDecoration} style={styles.bgTopRight} />
      <Image source={pinkFlowerSprigDecoration} style={styles.bgBottomLeft} />
      <Image source={pinkFlowerSprigDecoration} style={styles.bgBottomRight} />

      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 16 }]}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace("/home")} style={styles.iconButton}>
            <View style={styles.iconCircle}><BackIcon /></View>
            <Text variant="caption" weight="medium" color="#FFF" center style={{marginTop: 4}}>{t("common.back")}</Text>
          </Pressable>
          
          <Text variant="title" weight="bold" color="#FFF" center style={styles.title}>
            {t("myDay.title")}
          </Text>

          <Pressable onPress={() => router.replace("/home")} style={styles.iconButton}>
            <View style={styles.iconCircle}><HomeIcon /></View>
            <Text variant="caption" weight="medium" color="#FFF" center style={{marginTop: 4}}>{t("common.home")}</Text>
          </Pressable>
        </View>
        <View style={styles.repeatRow}>
          <SpeakerButton onPress={repeat} label={t("common.repeat")} />
        </View>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) + 60 }]} showsVerticalScrollIndicator={false}>
        <Text variant="subheading" weight="bold" color="#1D3A31" center style={{ marginVertical: 16 }}>
          {formatDayAndDate()}
        </Text>

        {permission !== "granted" ? (
          <View style={styles.permissionCard}>
            <Image source={reminderFlowerIcon} style={styles.permissionIcon} />
            <Text variant="body" color="#1D3A31" style={{ flex: 1, marginLeft: 16 }}>
              {t("errors.notificationPermission")}
            </Text>
          </View>
        ) : null}

        {timeline === null ? (
          <Text variant="body" center color="#1D3A31">{t("common.loading")}</Text>
        ) : timeline.length === 0 ? (
           <EmptyState
             title={t("myDay.empty")}
             illustration={<Illustration id="Calendar" size={90} />}
             actionLabel={t("common.goHome")}
             onAction={() => router.replace("/home")}
           />
        ) : (
          timeline.map((item) => {
            const isActive = isOutstanding(item.state) || item.state === "UPCOMING";
            return (
              <View key={item.eventId} style={{ marginBottom: 24 }}>
                <View style={[styles.routineCard, { opacity: item.state === "ACKNOWLEDGED" ? 0.7 : 1 }]}>
                  <Image source={pinkFlowerSprigDecoration} style={styles.cardFlowerDecor} />
                  <View style={styles.cardHeader}>
                    <Image source={KIND_ILLUSTRATION[item.kind] ?? KIND_ILLUSTRATION.MEDICINE} style={styles.routineIcon} />
                    <View style={styles.cardTitleCol}>
                      <Text variant="bodyLarge" weight="bold" color="#1D3A31">
                        {language === "as" && item.titleAs ? item.titleAs : item.titleEn}
                      </Text>
                      <Text variant="body" color="#4A6B5D">
                        {formatTime(item.dueAt)} · {t(`myDay.kind.${item.kind}`)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.statusStrip, { backgroundColor: item.state === "ACKNOWLEDGED" ? "#D1E6D9" : "#EDF5EB" }]}>
                    <Text variant="body" weight="bold" color="#1D3A31">
                      {t(stateMessageKey(item.state))}
                    </Text>
                  </View>
                </View>

                {isActive ? (
                  <View style={styles.actionsBlock}>
                    <Pressable onPress={() => void onDone(item)} style={({pressed}) => [styles.actionButton, { backgroundColor: "#1A4331", transform: [{ scale: pressed ? 0.98 : 1}] }]}>
                      <Image source={doneCheckIcon} style={styles.actionIcon} />
                      <Text variant="bodyLarge" weight="bold" color="#FFF" style={styles.actionText}>{t("myDay.done")}</Text>
                    </Pressable>
                    <Pressable onPress={() => void onSnooze(item)} style={({pressed}) => [styles.actionButton, { backgroundColor: "#3B755F", transform: [{ scale: pressed ? 0.98 : 1}] }]}>
                      <Image source={remindMeAgainIcon} style={styles.actionIcon} />
                      <Text variant="bodyLarge" weight="bold" color="#FFF" style={styles.actionText}>{t("myDay.remindAgain")}</Text>
                    </Pressable>
                    <Pressable onPress={() => void onHelp(item)} style={({pressed}) => [styles.actionButton, { backgroundColor: "#D33A31", transform: [{ scale: pressed ? 0.98 : 1}] }]}>
                      <Image source={helpLifebuoyIcon} style={styles.actionIcon} />
                      <Text variant="bodyLarge" weight="bold" color="#FFF" style={styles.actionText}>{t("myDay.needHelp")}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
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
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    flex: 1,
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
  repeatRow: {
    marginTop: 20,
    alignItems: "center",
  },
  content: {
    padding: 24,
  },
  permissionCard: {
    flexDirection: "row",
    backgroundColor: "#F7FBF4",
    borderRadius: 24,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  permissionIcon: {
    width: 50,
    height: 50,
    resizeMode: "contain",
  },
  routineCard: {
    backgroundColor: "#FFFCF5",
    borderRadius: 24,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
    overflow: "hidden",
  },
  cardFlowerDecor: {
    position: "absolute",
    top: -10,
    right: -10,
    width: 70,
    height: 70,
    resizeMode: "contain",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  routineIcon: {
    width: 80,
    height: 80,
    resizeMode: "contain",
    marginRight: 16,
  },
  cardTitleCol: {
    flex: 1,
    justifyContent: "center",
  },
  statusStrip: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  actionsBlock: {
    marginTop: 12,
    gap: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionIcon: {
    width: 32,
    height: 32,
    resizeMode: "contain",
    marginRight: 12,
  },
  actionText: {
    flex: 1,
    textAlign: "center",
    paddingRight: 44, // offset the icon for true centering
  },
});
