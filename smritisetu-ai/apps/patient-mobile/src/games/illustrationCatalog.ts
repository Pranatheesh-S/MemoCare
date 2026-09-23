/**
 * The single source of truth for which illustration ids exist.
 *
 * `illustrationMap.tsx` builds its component registry from this list, and the
 * content-pack tests check every pack's `illustrationId` against it — that test
 * stays pure (no react-native-svg import) because the ids live here as plain
 * strings.
 *
 * When you add a component to `illustrations.tsx`, add its id here and register
 * it in `illustrationMap.tsx`. All three must agree.
 */
export const ILLUSTRATION_IDS = [
  /* Shared, non-regional --------------------------------------------------- */
  "House",
  "SunRise",
  "Toothbrush",
  "Plate",
  "MedicineTablet",
  "WaterGlass",
  "Moon",
  "Walking",
  "FamilyTogether",
  "Phone",
  "HelpHand",
  "PhotoFrame",
  "GameCards",
  "Calendar",
  "CompanionFace",

  /* Assam --------------------------------------------------------------------*/
  "TeaLeaves",
  "BambooBasket",
  "Gamosa",
  "Pitha",
  "KopouFlower",
  "Dhol",
  "WaterPot",
  "Jaapi",
  "Rhino",
  "Namghar",
  "Xorai",

  /* Arunachal Pradesh ------------------------------------------------------- */
  "Mountains",
  "Mithun",
  "HandloomShawl",

  /* Manipur --------------------------------------------------------------- */
  "LoktakHut",
  "ShiruiLily",
  "Phanek",

  /* Meghalaya ------------------------------------------------------------- */
  "RootBridge",
  "RainShield",
  "PineHill",

  /* Mizoram ------------------------------------------------------------------*/
  "PuanCloth",
  "CherawBamboo",
  "PassionFruit",

  /* Nagaland --------------------------------------------------------------- */
  "NagaShawl",
  "LogDrum",
  "Hornbill",

  /* Sikkim --------------------------------------------------------------- */
  "SnowPeak",
  "Chorten",
  "PrayerFlags",

  /* Tripura ------------------------------------------------------------------*/
  "RisaCloth",
  "GariaPole",
  "Pineapple",
] as const;

export type IllustrationId = (typeof ILLUSTRATION_IDS)[number];

const ID_SET = new Set<string>(ILLUSTRATION_IDS);

export function isKnownIllustrationId(id: string): id is IllustrationId {
  return ID_SET.has(id);
}
