import React from "react";
import Svg, { Path, Rect, Circle, G, Polygon } from "react-native-svg";
import { colors } from "../theme/colors";
import type { IllustrationProps } from "./illustrations";

const OUTLINE = colors.deepForest;

/** A top-down / slightly isometric wooden market stall. */
export function MarketStall({ size = 120 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Shadow */}
      <Ellipse cx={50} cy={85} rx={45} ry={10} fill="rgba(0,0,0,0.15)" />
      
      {/* Back posts */}
      <Rect x={15} y={20} width={6} height={60} fill="#8B5A2B" stroke={OUTLINE} strokeWidth={2} />
      <Rect x={79} y={20} width={6} height={60} fill="#8B5A2B" stroke={OUTLINE} strokeWidth={2} />
      
      {/* Table base */}
      <Rect x={10} y={50} width={80} height={30} fill="#CD853F" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Path d="M10 60h80M10 70h80" stroke={OUTLINE} strokeWidth={2} opacity={0.3} />
      
      {/* Awning/Roof */}
      <Polygon points="5,30 25,10 75,10 95,30" fill="#E67E22" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      <Polygon points="5,30 15,35 25,30 35,35 45,30 55,35 65,30 75,35 85,30 95,30" fill="#D35400" stroke={OUTLINE} strokeWidth={2.5} strokeLinejoin="round" />
      
      {/* Front posts */}
      <Rect x={10} y={30} width={6} height={50} fill="#A0522D" stroke={OUTLINE} strokeWidth={2} />
      <Rect x={84} y={30} width={6} height={50} fill="#A0522D" stroke={OUTLINE} strokeWidth={2} />
    </Svg>
  );
}

/** A generic grassy background with a path for the market. */
export function MarketBackground({ size = 400 }: IllustrationProps): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" preserveAspectRatio="none">
      <Rect width="100" height="100" fill={colors.sage} opacity={0.3} />
      {/* Dirt Path */}
      <Path
        d="M20 0 Q30 30 50 50 T80 100"
        fill="none"
        stroke="#E6CCB2"
        strokeWidth={15}
        strokeLinecap="round"
      />
      <Path
        d="M80 0 Q70 30 50 50 T20 100"
        fill="none"
        stroke="#E6CCB2"
        strokeWidth={15}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Mock Ellipse since it wasn't imported from svg
import { Ellipse } from "react-native-svg";
