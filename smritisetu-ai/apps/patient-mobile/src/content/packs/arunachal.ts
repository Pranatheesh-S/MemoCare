import type { ContentPack } from "../types";

/**
 * Arunachal Pradesh.
 *
 * The most linguistically diverse state in India — 25+ major communities, each
 * with its own language, dress and craft. This pack is a neutral common ground
 * (mountains, cane and bamboo, handloom, the mithun); community packs carry the
 * specific material and are the intended way to use it well.
 *
 * `labelLocal` values are romanised and marked for native review, matching the
 * placeholder locale files.
 */
export const ARUNACHAL_PACK: ContentPack = {
  stateId: "AR",
  stateName: "Arunachal Pradesh",
  blurbEn:
    "Mountains, forests, cane and handloom shared across Arunachal's many communities. Choose a community pack for language and dress specific to a patient's people.",
  languages: [
    { code: "njz", labelEn: "Nyishi", labelNative: "Nyishi" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "arunachal.nyishi", labelEn: "Nyishi" },
    { id: "arunachal.adi", labelEn: "Adi" },
    { id: "arunachal.apatani", labelEn: "Apatani", noteEn: "Ziro valley, wet-rice and pine groves." },
    { id: "arunachal.monpa", labelEn: "Monpa", noteEn: "Tawang; Buddhist material — use with sensitivity." },
    { id: "arunachal.galo", labelEn: "Galo" },
  ],
  matchObjects: [
    { id: "cane-basket", labelKey: "object.caneBasket", labelEn: "Cane carrying basket", labelLocal: "nara", illustrationId: "BambooBasket", place: { labelEn: "By the doorway", labelLocal: "doorway", illustrationId: "House" }, similarGroup: "cane" },
    { id: "shawl", labelKey: "object.shawl", labelEn: "Handloom shawl", labelLocal: "gale", illustrationId: "HandloomShawl", place: { labelEn: "Folded on the bed", labelLocal: "bed", illustrationId: "House" }, similarGroup: "woven" },
    { id: "mithun", labelKey: "object.mithun", labelEn: "Mithun", labelLocal: "mithun", illustrationId: "Mithun", place: { labelEn: "The grazing hill", labelLocal: "hill", illustrationId: "Mountains" } },
    { id: "bamboo-mug", labelKey: "object.bambooMug", labelEn: "Bamboo mug", labelLocal: "bamboo mug", illustrationId: "WaterPot", place: { labelEn: "Kitchen shelf", labelLocal: "shelf", illustrationId: "Plate" }, similarGroup: "vessel" },
    { id: "orchid", labelKey: "object.orchid", labelEn: "Wild orchid", labelLocal: "orchid", illustrationId: "KopouFlower", place: { labelEn: "The verandah", labelLocal: "verandah", illustrationId: "SunRise" }, similarGroup: "green" },
    { id: "millet", labelKey: "object.millet", labelEn: "Millet", labelLocal: "tapyo", illustrationId: "Plate", place: { labelEn: "The store basket", labelLocal: "store", illustrationId: "BambooBasket" }, similarGroup: "cane" },
    { id: "loin-loom", labelKey: "object.loinLoom", labelEn: "Loin loom", labelLocal: "loin loom", illustrationId: "HandloomShawl", place: { labelEn: "The verandah", labelLocal: "verandah", illustrationId: "House" }, similarGroup: "woven" },
    { id: "hill-house", labelKey: "object.hillHouse", labelEn: "Stilt house", labelLocal: "chang ghar", illustrationId: "House", place: { labelEn: "On the ridge", labelLocal: "ridge", illustrationId: "Mountains" } },
  ],
  places: [
    { id: "himalaya", labelEn: "The mountains", labelLocal: "mountains" },
    { id: "ziro", labelEn: "Ziro valley", labelLocal: "Ziro", noteEn: "Apatani rice fields and pine groves." },
    { id: "tawang", labelEn: "Tawang", labelLocal: "Tawang", noteEn: "High Monpa country and the monastery — a familiar landmark, spoken of gently." },
    { id: "forest", labelEn: "The forest trail", labelLocal: "forest" },
    { id: "river", labelEn: "The Siang river", labelLocal: "Siang" },
  ],
  festivals: [
    { id: "nyokum", labelEn: "Nyokum (Nyishi)", labelLocal: "Nyokum" },
    { id: "solung", labelEn: "Solung (Adi)", labelLocal: "Solung" },
    { id: "mopin", labelEn: "Mopin (Galo)", labelLocal: "Mopin" },
    { id: "losar", labelEn: "Losar (Monpa)", labelLocal: "Losar", noteEn: "Buddhist new year — treat with sensitivity." },
  ],
  foods: [
    { id: "pika-pila", labelEn: "Pika pila", labelLocal: "pika pila", noteEn: "Fermented pork with bamboo shoot." },
    { id: "apong", labelEn: "Rice beer", labelLocal: "apong", noteEn: "Central to hospitality; mention as culture, not drink." },
    { id: "bamboo-shoot", labelEn: "Bamboo shoot", labelLocal: "hikhu" },
    { id: "marua", labelEn: "Millet bread", labelLocal: "marua" },
  ],
  music: [
    { id: "ponung", labelEn: "Ponung dance song (Adi)", labelLocal: "Ponung" },
    { id: "buiya", labelEn: "Buiya dance (Nyishi)", labelLocal: "Buiya" },
    { id: "drum", labelEn: "Log drum", labelLocal: "drum" },
  ],
  patterns: [
    { id: "gale-stripes", labelEn: "Gale skirt stripes", labelLocal: "gale" },
    { id: "cane-weave", labelEn: "Cane weave", labelLocal: "cane weave" },
    { id: "beadwork", labelEn: "Bead necklace", labelLocal: "beads" },
  ],
  illustrationIds: [
    "BambooBasket", "HandloomShawl", "Mithun", "WaterPot", "KopouFlower",
    "Plate", "House", "Mountains", "SunRise",
  ],
  culturalNotes: [
    "Never merge Arunachal's communities into one 'tribal' set — pick a community pack.",
    "Monpa and Sherdukpen material is Buddhist; monasteries are landmarks, not exhibits.",
  ],
};
