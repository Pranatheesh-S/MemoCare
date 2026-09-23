import type { ContentPack } from "../types";

/**
 * Manipur.
 *
 * Loktak Lake and its phumdi huts, the phanek, black rice, the pena, and the
 * valley household. Meitei material leads the pack; Kuki-Zo and Naga hill
 * communities have their own and should use community packs.
 *
 * `labelLocal` is romanised Meitei pending review (Meitei is written in Meitei
 * Mayek and Bengali script).
 */
export const MANIPUR_PACK: ContentPack = {
  stateId: "MN",
  stateName: "Manipur",
  blurbEn:
    "The Manipur valley — Loktak Lake, the phanek, black rice and the pena. Hill communities (Kuki-Zo, Tangkhul and others) have their own packs.",
  languages: [
    { code: "mni", labelEn: "Meitei (Manipuri)", labelNative: "ꯃꯤꯇꯩ ꯂꯣꯟ" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "manipur.meitei", labelEn: "Meitei (valley)" },
    { id: "manipur.tangkhul", labelEn: "Tangkhul Naga" },
    { id: "manipur.kuki", labelEn: "Kuki-Zo" },
    { id: "manipur.pangal", labelEn: "Meitei Pangal (Manipuri Muslim)" },
  ],
  matchObjects: [
    { id: "phanek", labelKey: "object.phanek", labelEn: "Phanek", labelLocal: "phanek", illustrationId: "Phanek", place: { labelEn: "Folded on the shelf", labelLocal: "shelf", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "innaphi", labelKey: "object.innaphi", labelEn: "Innaphi shawl", labelLocal: "innaphi", illustrationId: "HandloomShawl", place: { labelEn: "Over the shoulder", labelLocal: "shoulder", illustrationId: "FamilyTogether" }, similarGroup: "cloth" },
    { id: "shirui-lily", labelKey: "object.shiruiLily", labelEn: "Shirui lily", labelLocal: "kashong timrawon", illustrationId: "ShiruiLily", place: { labelEn: "The hill slope", labelLocal: "hill", illustrationId: "Mountains" }, similarGroup: "green" },
    { id: "lotus", labelKey: "object.lotus", labelEn: "Loktak lotus", labelLocal: "thambal", illustrationId: "KopouFlower", place: { labelEn: "The lake edge", labelLocal: "lake", illustrationId: "LoktakHut" }, similarGroup: "green" },
    { id: "fishing-basket", labelKey: "object.fishingBasket", labelEn: "Fishing basket", labelLocal: "lu", illustrationId: "BambooBasket", place: { labelEn: "By the boat", labelLocal: "boat", illustrationId: "LoktakHut" }, similarGroup: "cane" },
    { id: "brass-pot", labelKey: "object.brassPot", labelEn: "Brass pot", labelLocal: "chaphu", illustrationId: "WaterPot", place: { labelEn: "Kitchen shelf", labelLocal: "shelf", illustrationId: "Plate" }, similarGroup: "vessel" },
    { id: "pung", labelKey: "object.pung", labelEn: "Pung drum", labelLocal: "pung", illustrationId: "LogDrum", place: { labelEn: "The prayer room", labelLocal: "prayer room", illustrationId: "House" } },
    { id: "black-rice", labelKey: "object.blackRice", labelEn: "Black rice", labelLocal: "chak-hao", illustrationId: "Plate", place: { labelEn: "The store jar", labelLocal: "store", illustrationId: "WaterPot" }, similarGroup: "vessel" },
  ],
  places: [
    { id: "loktak", labelEn: "Loktak Lake", labelLocal: "Loktak", noteEn: "Floating phumdi islands and fishing huts." },
    { id: "kangla", labelEn: "Kangla", labelLocal: "Kangla", noteEn: "The old fort by the Imphal river." },
    { id: "ima-market", labelEn: "Ima Keithel", labelLocal: "Ima Keithel", noteEn: "The mothers' market, run entirely by women." },
    { id: "shirui", labelEn: "Shirui hills", labelLocal: "Shirui" },
    { id: "sangai", labelEn: "Keibul Lamjao", labelLocal: "Keibul Lamjao", noteEn: "The marsh where the sangai deer lives." },
  ],
  festivals: [
    { id: "yaoshang", labelEn: "Yaoshang", labelLocal: "Yaoshang", noteEn: "Five days of thabal chongba dancing." },
    { id: "ningol-chakouba", labelEn: "Ningol Chakouba", labelLocal: "Ningol Chakouba", noteEn: "Daughters return to their parents' home for a feast." },
    { id: "lai-haraoba", labelEn: "Lai Haraoba", labelLocal: "Lai Haraoba" },
    { id: "kut", labelEn: "Kut", labelLocal: "Kut", noteEn: "Kuki-Zo harvest festival." },
  ],
  foods: [
    { id: "eromba", labelEn: "Eromba", labelLocal: "eromba" },
    { id: "chak-hao-kheer", labelEn: "Black rice kheer", labelLocal: "chak-hao amubi" },
    { id: "singju", labelEn: "Singju", labelLocal: "singju" },
    { id: "ngari", labelEn: "Fermented fish", labelLocal: "ngari" },
  ],
  music: [
    { id: "pena", labelEn: "Pena", labelLocal: "pena", noteEn: "A one-string fiddle with a horn." },
    { id: "pung-cholom", labelEn: "Pung cholom", labelLocal: "pung cholom" },
    { id: "ras-leela", labelEn: "Manipuri Ras", labelLocal: "Ras", noteEn: "Devotional dance-drama." },
  ],
  patterns: [
    { id: "phanek-border", labelEn: "Phanek border", labelLocal: "mayek naibi" },
    { id: "moirang-phee", labelEn: "Moirang phee motif", labelLocal: "moirang phee" },
    { id: "lai-phee", labelEn: "Lai phee", labelLocal: "lai phee" },
  ],
  illustrationIds: [
    "Phanek", "HandloomShawl", "ShiruiLily", "KopouFlower", "BambooBasket",
    "WaterPot", "LogDrum", "Plate", "House", "FamilyTogether", "Mountains",
    "LoktakHut",
  ],
  culturalNotes: [
    "Loktak's fishing communities live on the lake — show the huts as home, not scenery.",
    "Valley and hill peoples are distinct; do not present Meitei material as all of Manipur.",
  ],
};
