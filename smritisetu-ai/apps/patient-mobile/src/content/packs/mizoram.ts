import type { ContentPack } from "../types";

/**
 * Mizoram.
 *
 * Blue hills, jhum fields, the puan and its woven bands, the khuang drum and
 * the cheraw bamboo dance. Church and Christmas are a large part of home life
 * and are included plainly.
 */
export const MIZORAM_PACK: ContentPack = {
  stateId: "MZ",
  stateName: "Mizoram",
  blurbEn:
    "The Mizo hills — jhum fields, the puan, the khuang drum, cheraw, and a home life woven through with church and Christmas.",
  languages: [
    { code: "lus", labelEn: "Mizo", labelNative: "Mizo ṭawng" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "mizoram.lusei", labelEn: "Lusei (Duhlian)" },
    { id: "mizoram.mara", labelEn: "Mara", noteEn: "Southern Mizoram; own language." },
    { id: "mizoram.lai", labelEn: "Lai (Pawi)" },
    { id: "mizoram.hmar", labelEn: "Hmar" },
  ],
  matchObjects: [
    { id: "puan", labelKey: "object.puan", labelEn: "Puan", labelLocal: "puan", illustrationId: "PuanCloth", place: { labelEn: "Folded on the shelf", labelLocal: "shelf", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "puanchei", labelKey: "object.puanchei", labelEn: "Puanchei", labelLocal: "puanchei", illustrationId: "HandloomShawl", place: { labelEn: "In the wooden box", labelLocal: "box", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "cheraw", labelKey: "object.cheraw", labelEn: "Cheraw bamboo", labelLocal: "cheraw", illustrationId: "CherawBamboo", place: { labelEn: "The courtyard", labelLocal: "courtyard", illustrationId: "SunRise" } },
    { id: "passion-fruit", labelKey: "object.passionFruit", labelEn: "Passion fruit", labelLocal: "sertawk", illustrationId: "PassionFruit", place: { labelEn: "The kitchen basket", labelLocal: "basket", illustrationId: "BambooBasket" }, similarGroup: "green" },
    { id: "chilli", labelKey: "object.chilli", labelEn: "Bird's eye chilli", labelLocal: "hmarcha", illustrationId: "Plate", place: { labelEn: "Drying by the window", labelLocal: "window", illustrationId: "SunRise" }, similarGroup: "green" },
    { id: "khumbeu", labelKey: "object.khumbeu", labelEn: "Bamboo hat", labelLocal: "khumbeu", illustrationId: "Jaapi", place: { labelEn: "On the door hook", labelLocal: "hook", illustrationId: "House" }, similarGroup: "cane" },
    { id: "em-basket", labelKey: "object.emBasket", labelEn: "Carrying basket", labelLocal: "em", illustrationId: "BambooBasket", place: { labelEn: "By the field path", labelLocal: "path", illustrationId: "PineHill" }, similarGroup: "cane" },
    { id: "rice-pot", labelKey: "object.ricePot", labelEn: "Rice pot", labelLocal: "bel", illustrationId: "WaterPot", place: { labelEn: "The hearth", labelLocal: "hearth", illustrationId: "Plate" }, similarGroup: "vessel" },
  ],
  places: [
    { id: "phawngpui", labelEn: "Phawngpui (Blue Mountain)", labelLocal: "Phawngpui" },
    { id: "reiek", labelEn: "Reiek hill", labelLocal: "Reiek" },
    { id: "vantawng", labelEn: "Vantawng falls", labelLocal: "Vantawng" },
    { id: "aizawl", labelEn: "Aizawl", labelLocal: "Aizawl", noteEn: "The ridge-top capital." },
    { id: "jhum", labelEn: "The jhum field", labelLocal: "lo" },
  ],
  festivals: [
    { id: "chapchar-kut", labelEn: "Chapchar Kut", labelLocal: "Chapchar Kut", noteEn: "Spring festival after the jhum clearing — cheraw and tlanglam." },
    { id: "mim-kut", labelEn: "Mim Kut", labelLocal: "Mim Kut", noteEn: "Maize festival, remembering the departed." },
    { id: "pawl-kut", labelEn: "Pawl Kut", labelLocal: "Pawl Kut", noteEn: "Harvest thanksgiving." },
    { id: "christmas", labelEn: "Christmas", labelLocal: "Krismas", noteEn: "Community feasts and carols; central to the year." },
  ],
  foods: [
    { id: "bai", labelEn: "Bai", labelLocal: "bai", noteEn: "Boiled vegetables with bekang." },
    { id: "vawksa-rep", labelEn: "Smoked pork", labelLocal: "vawksa rep" },
    { id: "sanpiau", labelEn: "Rice porridge", labelLocal: "sanpiau" },
    { id: "koat-pitha", labelEn: "Koat pitha", labelLocal: "koat pitha" },
  ],
  music: [
    { id: "khuang", labelEn: "Khuang drum", labelLocal: "khuang" },
    { id: "cheraw-dance", labelEn: "Cheraw (bamboo dance)", labelLocal: "cheraw" },
    { id: "tlanglam", labelEn: "Tlanglam dance", labelLocal: "tlanglam" },
    { id: "carols", labelEn: "Christmas carols", labelLocal: "hla" },
  ],
  patterns: [
    { id: "puanchei-motif", labelEn: "Puanchei bands", labelLocal: "puanchei" },
    { id: "ngotekherh", labelEn: "Ngotekherh", labelLocal: "ngotekherh" },
    { id: "hmaram", labelEn: "Hmaram", labelLocal: "hmaram" },
  ],
  illustrationIds: [
    "PuanCloth", "HandloomShawl", "CherawBamboo", "PassionFruit", "Plate",
    "Jaapi", "BambooBasket", "WaterPot", "House", "SunRise", "PineHill",
  ],
  culturalNotes: [
    "Christmas and church life are ordinary home context in Mizoram, not exotic — include them without comment.",
    "Mara, Lai and Hmar have their own languages; the Mizo pack is not automatically theirs.",
  ],
};
