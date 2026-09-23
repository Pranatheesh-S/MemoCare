import type { ContentPack } from "../types";

/**
 * Nagaland.
 *
 * Sixteen-plus recognised communities, each with its own language and its own
 * shawl whose stripes carry meaning. The log drum and morung, terrace fields,
 * the hornbill, smoked pork and the king chilli are shared ground; the shawl
 * and language are community-specific.
 */
export const NAGALAND_PACK: ContentPack = {
  stateId: "NL",
  stateName: "Nagaland",
  blurbEn:
    "Terrace fields, the morung and the log drum, the hornbill, and shawls whose stripes tell you the wearer's people. Choose the community for language and textile.",
  languages: [
    { code: "nag", labelEn: "Nagamese", labelNative: "Nagamese" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "nagaland.angami", labelEn: "Angami" },
    { id: "nagaland.ao", labelEn: "Ao" },
    { id: "nagaland.sumi", labelEn: "Sumi" },
    { id: "nagaland.lotha", labelEn: "Lotha" },
    { id: "nagaland.konyak", labelEn: "Konyak" },
  ],
  matchObjects: [
    { id: "naga-shawl", labelKey: "object.nagaShawl", labelEn: "Naga shawl", labelLocal: "shawl", illustrationId: "NagaShawl", place: { labelEn: "Folded on the bed", labelLocal: "bed", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "mekhala", labelKey: "object.mekhala", labelEn: "Wrap skirt", labelLocal: "mekhala", illustrationId: "HandloomShawl", place: { labelEn: "In the wooden box", labelLocal: "box", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "log-drum", labelKey: "object.logDrum", labelEn: "Log drum", labelLocal: "log drum", illustrationId: "LogDrum", place: { labelEn: "The morung", labelLocal: "morung", illustrationId: "House" } },
    { id: "hornbill-headgear", labelKey: "object.hornbill", labelEn: "Hornbill feather headgear", labelLocal: "headgear", illustrationId: "Hornbill", place: { labelEn: "On the wall", labelLocal: "wall", illustrationId: "PhotoFrame" } },
    { id: "bamboo-mug", labelKey: "object.bambooMug", labelEn: "Bamboo mug", labelLocal: "mug", illustrationId: "WaterPot", place: { labelEn: "Kitchen shelf", labelLocal: "shelf", illustrationId: "Plate" }, similarGroup: "vessel" },
    { id: "conical-basket", labelKey: "object.conicalBasket", labelEn: "Carrying basket", labelLocal: "khang", illustrationId: "BambooBasket", place: { labelEn: "By the field path", labelLocal: "path", illustrationId: "PineHill" }, similarGroup: "cane" },
    { id: "king-chilli", labelKey: "object.kingChilli", labelEn: "King chilli", labelLocal: "raja mircha", illustrationId: "Plate", place: { labelEn: "Drying by the hearth", labelLocal: "hearth", illustrationId: "SunRise" }, similarGroup: "green" },
    { id: "rice-pot", labelKey: "object.ricePot", labelEn: "Rice pot", labelLocal: "pot", illustrationId: "WaterPot", place: { labelEn: "The hearth", labelLocal: "hearth", illustrationId: "Plate" }, similarGroup: "vessel" },
  ],
  places: [
    { id: "kohima", labelEn: "Kohima", labelLocal: "Kohima", noteEn: "The hill capital; the war cemetery is a quiet landmark." },
    { id: "dzukou", labelEn: "Dzukou valley", labelLocal: "Dzukou", noteEn: "Seasonal lilies between the ridges." },
    { id: "khonoma", labelEn: "Khonoma", labelLocal: "Khonoma", noteEn: "Terraced Angami village." },
    { id: "morung", labelEn: "The morung", labelLocal: "morung", noteEn: "The community house where the young once learned." },
    { id: "terrace-fields", labelEn: "The terrace fields", labelLocal: "fields" },
  ],
  festivals: [
    { id: "hornbill", labelEn: "Hornbill Festival", labelLocal: "Hornbill", noteEn: "December gathering of many communities at Kisama." },
    { id: "sekrenyi", labelEn: "Sekrenyi (Angami)", labelLocal: "Sekrenyi" },
    { id: "moatsu", labelEn: "Moatsu (Ao)", labelLocal: "Moatsu" },
    { id: "aoleang", labelEn: "Aoleang (Konyak)", labelLocal: "Aoleang" },
  ],
  foods: [
    { id: "smoked-pork", labelEn: "Smoked pork with akhuni", labelLocal: "smoked pork" },
    { id: "galho", labelEn: "Galho", labelLocal: "galho", noteEn: "A one-pot rice and vegetable dish." },
    { id: "axone", labelEn: "Fermented soybean", labelLocal: "axone" },
    { id: "bamboo-shoot", labelEn: "Bamboo shoot", labelLocal: "bastenga" },
  ],
  music: [
    { id: "log-drum-call", labelEn: "Log drum call", labelLocal: "log drum" },
    { id: "folk-songs", labelEn: "Polyphonic folk songs", labelLocal: "li" },
    { id: "bamboo-mouth-organ", labelEn: "Bamboo mouth organ", labelLocal: "theku" },
  ],
  patterns: [
    { id: "angami-shawl", labelEn: "Angami loramhoushü", labelLocal: "loramhoushü" },
    { id: "ao-tsungkotepsu", labelEn: "Ao tsüngkotepsü", labelLocal: "tsüngkotepsü", noteEn: "The warrior shawl — worn by right, not decoration." },
    { id: "konyak-beads", labelEn: "Konyak bead and brass", labelLocal: "beads" },
  ],
  illustrationIds: [
    "NagaShawl", "HandloomShawl", "LogDrum", "Hornbill", "WaterPot",
    "BambooBasket", "Plate", "PineHill", "House", "PhotoFrame", "SunRise",
  ],
  culturalNotes: [
    "A shawl's stripes state the wearer's community and standing — do not mix motifs across communities.",
    "Festival and headhunting-era imagery is used respectfully and sparingly, framed as heritage.",
  ],
};
