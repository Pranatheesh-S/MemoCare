import React from "react";
import { StyleSheet, View, Image, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { role, colors } from "../../src/theme/colors";
import { radius, shadow, spacing } from "../../src/theme/tokens";
import { useTranslation } from "../../src/i18n/useTranslation";
import { useVoiceGuidance } from "../../src/audio/useVoiceGuidance";
import { useAppStore } from "../../src/store/appStore";
import { memoryLaneIcon, footerTeacupIcon, storyRecallIcon, marketMemoryIcon, whoIsThisIcon, memoryMatchIcon, settingsButtonIcon, myRoutineIcon } from "../../src/assets/embeddedAssets";

type GameCardProps = {
  testID: string;
  title: string;
  subtitle: string;
  bgColor: string;
  imageSource: any;
  onPress: () => void;
  isSuggested?: boolean;
};

function GameCard({
  testID,
  title,
  subtitle,
  bgColor,
  imageSource,
  onPress,
  isSuggested,
}: GameCardProps) {
  const { t } = useTranslation();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: bgColor, opacity: pressed ? 0.94 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        shadow.card as object,
      ]}
    >
      <View style={styles.cardImageContainer}>
        <Image source={imageSource} style={styles.cardImage} resizeMode="contain" />
      </View>
      <View style={styles.cardTextContainer}>
        <Text variant="bodyLarge" weight="bold" color="#1A4331" center style={styles.cardTitle}>
          {title}
        </Text>
        <Text variant="caption" color="#5C766C" center numberOfLines={2}>
          {subtitle}
        </Text>
      </View>
      {isSuggested && (
        <View style={styles.suggestedBadge}>
          <Text variant="caption" weight="bold" color="#6D5514" center numberOfLines={1} adjustsFontSizeToFit>
            ⭐ {t("games.suggested")}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function GamesScreen(): React.ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const { repeat } = useVoiceGuidance("games.title");
  const recommended = useAppStore((state) => state.recommendedGame);

  return (
    <Screen title={t("games.title")} onRepeat={repeat} showBack scrollable>
      <View style={styles.grid}>
        <GameCard
          testID="game-memory-match"
          title="Memory Match"
          subtitle="Match the hidden cards"
          bgColor="#E8F5E9"
          imageSource={memoryMatchIcon}
          onPress={() => router.push("/games/memory-match")}
          isSuggested={recommended === "MEMORY_MATCH"}
        />
        <GameCard
          testID="game-who-is-this"
          title={t("games.whoIsThis")}
          subtitle={t("games.whoIsThisTarget")}
          bgColor="#F1F8E9"
          imageSource={whoIsThisIcon}
          onPress={() => router.push("/games/who-is-this")}
          isSuggested={recommended === "WHO_IS_THIS"}
        />
        <GameCard
          testID="game-routine-builder"
          title={t("games.routineBuilder")}
          subtitle={t("games.routineBuilderTarget")}
          bgColor="#FFF9C4"
          imageSource={myRoutineIcon}
          onPress={() => router.push("/games/routine-builder")}
          isSuggested={recommended === "ROUTINE_BUILDER"}
        />
        <GameCard
          testID="game-memory-lane"
          title={t("games.memoryLane")}
          subtitle={t("games.memoryLaneTarget")}
          bgColor="#F3E5F5"
          imageSource={memoryLaneIcon}
          onPress={() => router.push("/games/memory-lane")}
          isSuggested={recommended === "MEMORY_LANE"}
        />
        <GameCard
          testID="game-market-memory"
          title="Market Memory"
          subtitle={t("Fill the cart")}
          bgColor="#E8F5E9"
          imageSource={marketMemoryIcon}
          onPress={() => router.push("/games/market-memory")}
          isSuggested={recommended === "MARKET_MEMORY"}
        />
        <GameCard
          testID="game-story-recall"
          title="Story Recall"
          subtitle={t("games.storyRecallTarget")}
          bgColor="#FCE4EC"
          imageSource={storyRecallIcon}
          onPress={() => router.push("/games/story-recall")}
          isSuggested={(recommended as string | null) === "STORY_RECALL"}
        />
      </View>

      {/* Bottom Banner */}
      <View style={styles.banner}>
        <Image source={footerTeacupIcon} style={styles.bannerIcon} resizeMode="contain" />
        <Text variant="bodyLarge" weight="bold" color="#1A4331">
          Take your time. There is no hurry.
        </Text>
      </View>
      
      {/* Settings FAB */}
      <Pressable style={styles.fab} onPress={() => router.push("/settings")}>
        <Image source={settingsButtonIcon} style={styles.fabIcon} resizeMode="contain" />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 16,
    columnGap: 12,
    marginTop: 16,
    marginBottom: 40,
  },
  card: {
    width: "47%",
    borderRadius: 24,
    padding: 12,
    alignItems: "center",
    position: "relative",
    paddingBottom: 28,
  },
  cardImageContainer: {
    width: 90,
    height: 90,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  cardImage: {
    width: "100%",
    height: "100%",
  },
  cardTextContainer: {
    alignItems: "center",
  },
  cardTitle: {
    fontSize: 20,
    lineHeight: 22,
    marginBottom: 4,
  },
  suggestedBadge: {
    position: "absolute",
    bottom: -12,
    width: "90%",
    backgroundColor: "#FDF5D3",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E6D59A",
    alignItems: "center",
  },
  repeatButton: {
    backgroundColor: "#639B82",
    borderRadius: 24,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    ...(shadow.raised as object),
  },
  banner: {
    backgroundColor: "#FFFCF5",
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 40, // Space for FAB
    ...(shadow.card as object),
  },
  bannerIcon: {
    width: 48,
    height: 48,
    marginRight: 12,
  },
  fab: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 64,
    height: 64,
    zIndex: 10,
  },
  fabIcon: {
    width: "100%",
    height: "100%",
  }
});
