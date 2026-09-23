import React from "react";
import type { ComponentType } from "react";
import {
  BambooBasket,
  Calendar,
  CherawBamboo,
  Chorten,
  Dhol,
  FamilyTogether,
  GameCards,
  Gamosa,
  GariaPole,
  HandloomShawl,
  HelpHand,
  Hornbill,
  House,
  Jaapi,
  KopouFlower,
  LogDrum,
  LoktakHut,
  MedicineTablet,
  Mithun,
  Moon,
  Mountains,
  Namghar,
  NagaShawl,
  PassionFruit,
  Phanek,
  PhotoFrame,
  Phone,
  PineHill,
  Pineapple,
  Pitha,
  Plate,
  PrayerFlags,
  PuanCloth,
  RainShield,
  Rhino,
  RisaCloth,
  RootBridge,
  ShiruiLily,
  SnowPeak,
  SunRise,
  TeaLeaves,
  Toothbrush,
  Walking,
  WaterGlass,
  WaterPot,
  Xorai,
  CompanionFace,
  type IllustrationProps,
} from "./illustrations";
import { ILLUSTRATION_IDS, type IllustrationId } from "./illustrationCatalog";

/**
 * Resolves an illustration id to its component.
 *
 * Keeping this separate from gameContent.ts is what lets the game logic be
 * pure data, and what lets an unknown id degrade to a blank space instead of
 * crashing a screen. The id list lives in illustrationCatalog.ts so the
 * content-pack tests can check it without importing react-native-svg.
 */
const REGISTRY: Record<IllustrationId, ComponentType<IllustrationProps>> = {
  /* Shared */
  House,
  SunRise,
  Toothbrush,
  Plate,
  MedicineTablet,
  WaterGlass,
  Moon,
  Walking,
  FamilyTogether,
  Phone,
  HelpHand,
  PhotoFrame,
  GameCards,
  Calendar,
  CompanionFace,
  /* Assam */
  TeaLeaves,
  BambooBasket,
  Gamosa,
  Pitha,
  KopouFlower,
  Dhol,
  WaterPot,
  Jaapi,
  Rhino,
  Namghar,
  Xorai,
  /* Arunachal Pradesh */
  Mountains,
  Mithun,
  HandloomShawl,
  /* Manipur */
  LoktakHut,
  ShiruiLily,
  Phanek,
  /* Meghalaya */
  RootBridge,
  RainShield,
  PineHill,
  /* Mizoram */
  PuanCloth,
  CherawBamboo,
  PassionFruit,
  /* Nagaland */
  NagaShawl,
  LogDrum,
  Hornbill,
  /* Sikkim */
  SnowPeak,
  Chorten,
  PrayerFlags,
  /* Tripura */
  RisaCloth,
  GariaPole,
  Pineapple,
};

// Fail fast in development if the catalog and the registry drift apart.
if (typeof __DEV__ !== "undefined" && __DEV__) {
  const missing = ILLUSTRATION_IDS.filter((id) => !(id in REGISTRY));
  if (missing.length > 0) {
    console.warn(`[illustrations] catalog ids with no component: ${missing.join(", ")}`);
  }
}

export function Illustration({
  id,
  size = 72,
}: {
  id: IllustrationId | string;
  size?: number;
}): React.ReactElement | null {
  const Component = REGISTRY[id as IllustrationId];
  if (!Component) return null;
  return <Component size={size} />;
}

export function hasIllustration(id: string): boolean {
  return id in REGISTRY;
}

export const ILLUSTRATION_COMPONENT_IDS = Object.keys(REGISTRY);

declare const __DEV__: boolean | undefined;
