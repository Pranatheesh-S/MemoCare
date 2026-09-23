import type { ContentPack } from "../types";

/**
 * Tripura.
 *
 * Bamboo and cane in every corner of the house, the risa and rignai, the Garia
 * pole, queen pineapples and the kham drum. Kokborok-speaking communities and
 * the Bengali majority both belong here and are kept distinct.
 */
export const TRIPURA_PACK: ContentPack = {
  stateId: "TR",
  stateName: "Tripura",
  blurbEn:
    "Bamboo and cane craft, the risa and rignai, Garia puja and queen pineapples — the home life of Tripura's Kokborok communities and its Bengali families.",
  languages: [
    { code: "trp", labelEn: "Kokborok", labelNative: "Kokborok" },
    { code: "bn", labelEn: "Bengali", labelNative: "বাংলা" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "tripura.tripuri", labelEn: "Tripuri (Debbarma)" },
    { id: "tripura.reang", labelEn: "Reang (Bru)", noteEn: "Known for the Hojagiri dance." },
    { id: "tripura.jamatia", labelEn: "Jamatia" },
    { id: "tripura.chakma", labelEn: "Chakma" },
    { id: "tripura.bengali", labelEn: "Bengali" },
  ],
  matchObjects: [
    { id: "risa", labelKey: "object.risa", labelEn: "Risa", labelLocal: "risa", illustrationId: "RisaCloth", place: { labelEn: "Folded on the shelf", labelLocal: "shelf", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "rignai", labelKey: "object.rignai", labelEn: "Rignai", labelLocal: "rignai", illustrationId: "Phanek", place: { labelEn: "In the bamboo chest", labelLocal: "chest", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "garia-pole", labelKey: "object.gariaPole", labelEn: "Garia pole", labelLocal: "garia", illustrationId: "GariaPole", place: { labelEn: "The courtyard", labelLocal: "courtyard", illustrationId: "SunRise" } },
    { id: "pineapple", labelKey: "object.pineapple", labelEn: "Queen pineapple", labelLocal: "menda", illustrationId: "Pineapple", place: { labelEn: "The kitchen basket", labelLocal: "basket", illustrationId: "BambooBasket" }, similarGroup: "green" },
    { id: "mora", labelKey: "object.mora", labelEn: "Cane stool", labelLocal: "mora", illustrationId: "BambooBasket", place: { labelEn: "By the verandah", labelLocal: "verandah", illustrationId: "House" }, similarGroup: "cane" },
    { id: "jackfruit", labelKey: "object.jackfruit", labelEn: "Jackfruit", labelLocal: "kathal", illustrationId: "Pineapple", place: { labelEn: "Under the tree", labelLocal: "tree", illustrationId: "PineHill" }, similarGroup: "green" },
    { id: "kham", labelKey: "object.kham", labelEn: "Kham drum", labelLocal: "kham", illustrationId: "LogDrum", place: { labelEn: "The front room", labelLocal: "front room", illustrationId: "FamilyTogether" } },
    { id: "earthen-pot", labelKey: "object.earthenPot", labelEn: "Earthen pot", labelLocal: "pot", illustrationId: "WaterPot", place: { labelEn: "The hearth", labelLocal: "hearth", illustrationId: "Plate" }, similarGroup: "vessel" },
  ],
  places: [
    { id: "ujjayanta", labelEn: "Ujjayanta Palace", labelLocal: "Ujjayanta", noteEn: "The old palace in Agartala." },
    { id: "neermahal", labelEn: "Neermahal", labelLocal: "Neermahal", noteEn: "The lake palace on Rudrasagar." },
    { id: "unakoti", labelEn: "Unakoti", labelLocal: "Unakoti", noteEn: "Ancient rock carvings in the hills." },
    { id: "jampui", labelEn: "Jampui hills", labelLocal: "Jampui", noteEn: "Orange orchards and the flower show." },
    { id: "dumboor", labelEn: "Dumboor lake", labelLocal: "Dumboor" },
  ],
  festivals: [
    { id: "garia-puja", labelEn: "Garia Puja", labelLocal: "Garia", noteEn: "Prayers for the harvest around a decorated bamboo pole." },
    { id: "kharchi-puja", labelEn: "Kharchi Puja", labelLocal: "Kharchi" },
    { id: "ker-puja", labelEn: "Ker Puja", labelLocal: "Ker" },
    { id: "bizu", labelEn: "Bizu (Chakma)", labelLocal: "Bizu" },
    { id: "durga-puja", labelEn: "Durga Puja", labelLocal: "Durga Puja" },
  ],
  foods: [
    { id: "mui-borok", labelEn: "Mui borok", labelLocal: "mui borok", noteEn: "Tripuri cooking built around berma (fermented fish)." },
    { id: "mosdeng", labelEn: "Mosdeng salad", labelLocal: "mosdeng" },
    { id: "chakhwi", labelEn: "Chakhwi", labelLocal: "chakhwi" },
    { id: "pitha", labelEn: "Pitha", labelLocal: "pitha" },
  ],
  music: [
    { id: "kham-sumui", labelEn: "Kham and sumui", labelLocal: "kham, sumui", noteEn: "Drum and bamboo flute." },
    { id: "hojagiri", labelEn: "Hojagiri dance", labelLocal: "Hojagiri", noteEn: "Reang dance balanced on an earthen pitcher." },
    { id: "garia-dance", labelEn: "Garia dance", labelLocal: "Garia" },
    { id: "lokgeeti", labelEn: "Bengali lokgeeti", labelLocal: "lokgeeti" },
  ],
  patterns: [
    { id: "risa-motif", labelEn: "Risa motifs", labelLocal: "risa" },
    { id: "tripuri-stripes", labelEn: "Tripuri handloom stripes", labelLocal: "pachra" },
    { id: "cane-weave", labelEn: "Cane and bamboo weave", labelLocal: "cane" },
  ],
  illustrationIds: [
    "RisaCloth", "Phanek", "GariaPole", "Pineapple", "BambooBasket",
    "LogDrum", "WaterPot", "House", "SunRise", "PineHill", "FamilyTogether",
    "Plate",
  ],
  culturalNotes: [
    "Kokborok-speaking communities and Bengali families share Tripura; offer both language packs, not one.",
    "The Garia pole is ritual, not ornament — show it dressed for the puja, in the courtyard.",
  ],
};
