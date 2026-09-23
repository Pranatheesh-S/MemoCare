import React, { useCallback, useEffect, useState } from "react";
import { View, StyleSheet, Pressable, ScrollView, Animated, Image } from "react-native";
import { useRouter } from "expo-router";
import { Screen } from "../../src/components/Screen";
import { Text } from "../../src/components/Text";
import { Button } from "../../src/components/Button";
import { ConfirmDialog } from "../../src/components/ConfirmDialog";
import { Illustration } from "../../src/games/illustrationMap";
import { colors, role } from "../../src/theme/colors";
import { radius, shadow, spacing } from "../../src/theme/tokens";
import { useTranslation } from "../../src/i18n/useTranslation";
import { useVoiceGuidance } from "../../src/audio/useVoiceGuidance";
import { useAppStore } from "../../src/store/appStore";
import { useGameSession } from "../../src/games/useGameSession";
import * as game from "../../src/games/logic/marketMemory";
import { GameFade, RoundCompleteMoment } from "../../src/games/GameFeel";
import { hapticComplete, hapticMatch } from "../../src/games/feel";

import { 
  villageMarketBg, 
  jaapiIcon, 
  gamosaIcon, 
  pithaIcon, 
  leafItemIcon, 
  flowerItemIcon, 
  basketIcon, 
  pinkFlower, 
  floralCorner, 
  leafSprig 
} from '../../src/assets/marketAssets';

const getItemIcon = (id: string): any => {
  if (id === 'jaapi') return jaapiIcon;
  if (id === 'gamosa') return gamosaIcon;
  if (id === 'pitha') return pithaIcon;
  if (id === 'tea') return leafItemIcon;
  if (id === 'flower') return flowerItemIcon;
  if (id === 'basket') return basketIcon;
  return basketIcon;
};

export default function MarketMemoryScreen(): React.ReactElement {
  const router = useRouter();
  const { language } = useTranslation();
  // Using generic games.wellDone for now, could add specific voice guidance later.
  const { speak } = useVoiceGuidance("games.wellDone");
  const reducedMotion = useAppStore((state) => state.reducedMotion);
  const { config, recordSession, resetRecording } = useGameSession("MARKET_MEMORY");

  const [state, setState] = useState<game.MarketMemoryState | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState<string>("Remember these items for the market");

  const start = useCallback(() => {
    resetRecording();
    const fresh = game.createGame(
      config.difficulty,
      config.hintsAllowed,
      undefined,
      undefined,
      config.itemCount,
    );
    setState(fresh);
    setFinished(false);
    setMessage("Remember these items for the market");
  }, [config.difficulty, config.hintsAllowed, config.itemCount, resetRecording]);

  useEffect(() => {
    if (config.loaded && !state) start();
  }, [config.loaded, start, state]);

  const onStartExploring = useCallback(() => {
    setState((s) => (s ? game.startExploring(s) : s));
    setMessage("Find the items in the market!");
  }, []);

  const onHint = useCallback(() => {
    setState((current) => {
      if (!current) return current;
      const { state: hinted, revealedItemId } = game.useHint(current);
      if (revealedItemId) {
        setMessage(`Look for the ${current.shoppingList.find(i => i.id === revealedItemId)?.labelEn}`);
      }
      return hinted;
    });
  }, []);

  const finish = useCallback(
    async (finalState: game.MarketMemoryState, completed: boolean) => {
      setFinished(true);
      await recordSession(
        {
          accuracy: game.computeAccuracy(finalState),
          responseTimeSeconds: game.averageResponseSeconds(finalState),
          hintsUsed: finalState.hintsUsed,
          attempts: finalState.attempts,
          completed,
          abandoned: !completed && finalState.foundItems.length === 0,
          engagementDurationSeconds: game.elapsedSeconds(finalState),
        }
      );
    },
    [recordSession],
  );

  const onCardPress = useCallback(
    (itemId: string) => {
      setState((current) => {
        if (!current) return current;
        const result = game.tapItem(current, itemId);

        if (result.outcome === "FOUND") {
          hapticMatch(reducedMotion);
          setMessage(`Found it! ${result.state.foundItems.length} / ${result.state.shoppingList.length}`);
        } else if (result.outcome === "WRONG_ITEM") {
          setMessage("That's not on the list.");
        } else if (result.outcome === "COMPLETED") {
          hapticComplete(reducedMotion);
          setMessage("Well done! You found everything.");
          void finish(result.state, true);
        }

        return result.state;
      });
    },
    [reducedMotion, finish],
  );

  const leave = useCallback(async () => {
    if (state && !finished) await finish(state, false);
    router.replace("/games");
  }, [finish, finished, router, state]);

  if (!state) {
    return (
      <Screen title="Market Memory" showBack>
        <Text variant="bodyLarge" center>Loading...</Text>
      </Screen>
    );
  }

  return (
    <Screen
      title="Market Memory"
      showBack
      onBackPress={() => setConfirmExit(true)}
      onHomePress={() => setConfirmExit(true)}
      footer={
        finished ? (
          <View style={styles.footerActions}>
            <Button label="Play Next" onPress={() => start()} />
            <Button label="Go Home" onPress={() => router.replace("/games")} tone="secondary" />
          </View>
        ) : state.phase === "READING_LIST" ? (
          <Button label="Start Shopping" onPress={onStartExploring} />
        ) : (
          <Button
            label="Use Hint"
            onPress={onHint}
            disabled={state.hintsRemaining <= 0}
          />
        )
      }
    >
      <GameFade reducedMotion={reducedMotion}>
        <View style={styles.messageBox}>
          <Image source={pinkFlower} style={styles.cardDecoTopLeft} />
          <Image source={floralCorner} style={styles.cardDecoBottomRight} />
          <Text variant="title" weight="bold" color="#0D2C1E" center>{message}</Text>
        </View>

        {state.phase === "READING_LIST" ? (
          <View style={styles.shoppingList}>
            {state.shoppingList.map((item) => (
              <View key={item.id} style={styles.listItem}>
                <View style={styles.listIconWrapper}>
                  <Image source={getItemIcon(item.id)} style={styles.listIcon} />
                </View>
                <View style={styles.listDivider} />
                <View style={styles.listLabelWrapper}>
                  <Image source={leafSprig} style={styles.listDecoLeaf} />
                  <Text variant="title" weight="bold" color="#0D2C1E">
                    {language === "as" ? item.labelAs : item.labelEn}
                  </Text>
                  {item.id === 'gamosa' || item.id === 'pitha' ? (
                    <Image source={pinkFlower} style={styles.listDecoFlower} />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.marketContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.mapArea}>
                  <Image source={villageMarketBg} style={styles.marketBackground} />
                  
                  {game.MARKET_ITEMS.map((item, index) => {
                    const isFound = state.foundItems.includes(item.id);
                    const ITEM_POSITIONS: Record<string, { left: string, top: string }> = {
                      'tea': { left: "28%", top: "35%" },
                      'basket': { left: "55%", top: "80%" },
                      'gamosa': { left: "15%", top: "72%" },
                      'pitha': { left: "47%", top: "75%" },
                      'pot': { left: "75%", top: "85%" },
                      'jaapi': { left: "86%", top: "62%" },
                      'flower': { left: "70%", top: "35%" },
                    };
                    const pos = ITEM_POSITIONS[item.id] || { left: "50%", top: "50%" };
                    
                    if (isFound) return null;
                    
                    return (
                      <Pressable 
                        key={item.id}
                        style={[styles.marketItem, pos]}
                        onPress={() => onCardPress(item.id)}
                      >
                        <Image source={getItemIcon(item.id)} style={styles.marketItemIcon} />
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>
            </ScrollView>
            
            {/* HUD: Found items in Basket */}
            <View style={styles.basketHUD}>
               <Image source={basketIcon} style={{ width: 32, height: 32 }} />
               <View style={styles.basketItems}>
                 {state.foundItems.map(id => {
                   return <Image key={id} source={getItemIcon(id)} style={{ width: 20, height: 20 }} />;
                 })}
               </View>
            </View>
          </View>
        )}
      </GameFade>

      <RoundCompleteMoment
        visible={finished}
        reducedMotion={reducedMotion}
        message="Well done! You found everything."
      />

      <ConfirmDialog
        visible={confirmExit}
        title="Exit Game?"
        confirmLabel="Go Home"
        cancelLabel="Stay"
        onConfirm={() => {
          setConfirmExit(false);
          void leave();
        }}
        onCancel={() => setConfirmExit(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  messageBox: {
    minHeight: 100,
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    marginVertical: spacing.md,
    position: 'relative',
    ...(shadow.card as object),
    elevation: 3,
  },
  cardDecoTopLeft: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 40,
    height: 40,
    resizeMode: "contain",
  },
  cardDecoBottomRight: {
    position: "absolute",
    bottom: -5,
    right: -5,
    width: 50,
    height: 50,
    resizeMode: "contain",
  },
  shoppingList: {
    flex: 1,
    gap: spacing.lg,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9F8F1",
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...(shadow.card as object),
    elevation: 2,
    borderWidth: 1,
    borderColor: "#E3DAC0",
    minHeight: 100,
  },
  listIconWrapper: {
    width: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  listIcon: {
    width: 60,
    height: 60,
    resizeMode: "contain",
  },
  listDivider: {
    width: 1,
    height: 60,
    backgroundColor: "#E3DAC0",
    marginHorizontal: spacing.md,
  },
  listLabelWrapper: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    paddingLeft: spacing.sm,
  },
  listDecoLeaf: {
    width: 20,
    height: 20,
    resizeMode: "contain",
    marginRight: spacing.sm,
  },
  listDecoFlower: {
    position: "absolute",
    right: -5,
    bottom: -15,
    width: 30,
    height: 30,
    resizeMode: "contain",
  },
  marketContainer: {
    flex: 1,
    borderRadius: radius.xl,
    overflow: "hidden",
    position: "relative",
    minHeight: 500,
  },
  mapArea: {
    width: 1333,
    height: 1000,
    position: "relative",
  },
  marketBackground: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  marketItem: {
    position: "absolute",
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  marketItemIcon: {
    width: 64,
    height: 64,
    resizeMode: "contain",
  },
  basketHUD: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.md,
    backgroundColor: "#F9F8F1",
    padding: spacing.sm,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#0D2C1E",
    elevation: 5,
  },
  basketItems: {
    flexDirection: "row",
    marginLeft: spacing.sm,
    gap: spacing.xs,
  },
  footerActions: {
    gap: spacing.md,
  },
});
