import React from "react";
import { StyleSheet, View, Dimensions, Pressable } from "react-native";
import Svg, { Defs, Mask, Rect } from "react-native-svg";
import { useSpotlightStore } from "../store/spotlightStore";
import { Button } from "./Button";
import { Text } from "./Text";
import { colors } from "../theme/colors";
import { spacing } from "../theme/tokens";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export function SpotlightOverlay() {
  const activeTargetId = useSpotlightStore((state) => state.activeTargetId);
  const targetLayout = useSpotlightStore((state) => state.targetLayout);
  const prompt = useSpotlightStore((state) => state.prompt);
  const clearSpotlight = useSpotlightStore((state) => state.clearSpotlight);

  if (!activeTargetId) return null;

  // We only render the dark mask once we have coordinates so the screen doesn't
  // go fully black while waiting for measureInWindow to fire.
  if (!targetLayout) return null;

  // Add a little padding around the cutout for breathing room
  const PADDING = 8;
  const cx = targetLayout.x - PADDING;
  const cy = targetLayout.y - PADDING;
  const cw = targetLayout.width + PADDING * 2;
  const ch = targetLayout.height + PADDING * 2;

  // Ensure prompt text is rendered in a sensible place (usually center screen, 
  // or below the element if there is room)
  const isTargetInTopHalf = cy < SCREEN_HEIGHT / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" accessibilityViewIsModal={true}>
      <Svg pointerEvents="none" height="100%" width="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="mask">
            <Rect x="0" y="0" width="100%" height="100%" fill="white" />
            <Rect x={cx} y={cy} width={cw} height={ch} rx={16} ry={16} fill="black" />
          </Mask>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="rgba(0, 0, 0, 0.75)" mask="url(#mask)" />
      </Svg>

      {/* Invisible touch blockers that cover everything EXCEPT the hole */}
      <Pressable style={{ position: "absolute", top: 0, left: 0, right: 0, height: Math.max(0, cy) }} onPress={clearSpotlight} />
      <Pressable style={{ position: "absolute", top: cy + ch, left: 0, right: 0, bottom: 0 }} onPress={clearSpotlight} />
      <Pressable style={{ position: "absolute", top: cy, left: 0, width: Math.max(0, cx), height: ch }} onPress={clearSpotlight} />
      <Pressable style={{ position: "absolute", top: cy, left: cx + cw, right: 0, height: ch }} onPress={clearSpotlight} />

      <View style={[styles.contentContainer, isTargetInTopHalf ? { bottom: 100 } : { top: 100 }]} pointerEvents="box-none">
        {prompt ? (
          <View style={styles.promptBox}>
            <Text variant="subheading" weight="bold" center color="#173D32">
              {prompt}
            </Text>
          </View>
        ) : null}

        <View style={styles.escapeHatch}>
          <Button 
            label="Not Now" 
            tone="quiet" 
            onPress={clearSpotlight} 
            style={{ backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 0 }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    alignItems: "center",
    gap: spacing.xl,
  },
  promptBox: {
    backgroundColor: "#FDF8ED",
    padding: spacing.lg,
    borderRadius: 24,
    width: "100%",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  escapeHatch: {
    marginTop: spacing.md,
  },
});
