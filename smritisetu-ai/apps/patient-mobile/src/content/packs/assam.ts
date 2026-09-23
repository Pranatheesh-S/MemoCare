import type { ContentPack } from "../types";

/**
 * Assam.
 *
 * Bihu, the gamosa, tea gardens, the Brahmaputra, and the everyday objects of
 * an Assamese household. Communities such as the Bodo and the Mishing have
 * their own material; add them as `communities` entries with object overrides
 * rather than folding them into one "Assamese" set.
 */
export const ASSAM_PACK: ContentPack = {
  stateId: "AS",
  stateName: "Assam",
  blurbEn:
    "Everyday life in Assam — the plains, the tea gardens, Bihu and the family home. Assam has many communities; this is a starting pack, not the whole state.",
  languages: [{ code: "as", labelEn: "Assamese", labelNative: "অসমীয়া" }],
  communities: [
    { id: "assam.general", labelEn: "General (Brahmaputra valley)" },
    { id: "assam.bodo", labelEn: "Bodo", noteEn: "Bodo dokhona, bagurumba, aronai — add as overrides." },
    { id: "assam.mishing", labelEn: "Mishing", noteEn: "Riverine Mishing households along the Brahmaputra." },
  ],
  matchObjects: [
    { id: "tea", labelKey: "object.tea", labelEn: "Tea leaves", labelLocal: "চাহ পাত", illustrationId: "TeaLeaves", place: { labelEn: "Kitchen shelf", labelLocal: "ৰান্ধনি ঘৰৰ তাক", illustrationId: "Plate" }, similarGroup: "green" },
    { id: "basket", labelKey: "object.basket", labelEn: "Bamboo basket", labelLocal: "খৰাহি", illustrationId: "BambooBasket", place: { labelEn: "By the door", labelLocal: "দুৱাৰৰ ওচৰত", illustrationId: "House" }, similarGroup: "bamboo" },
    { id: "gamosa", labelKey: "object.gamosa", labelEn: "Gamosa", labelLocal: "গামোচা", illustrationId: "Gamosa", place: { labelEn: "On the shelf", labelLocal: "তাকত", illustrationId: "House" } },
    { id: "pitha", labelKey: "object.pitha", labelEn: "Pitha", labelLocal: "পিঠা", illustrationId: "Pitha", place: { labelEn: "Kitchen table", labelLocal: "ৰান্ধনি ঘৰৰ মেজ", illustrationId: "Plate" } },
    { id: "kopou", labelKey: "object.kopou", labelEn: "Kopou flower", labelLocal: "কপৌ ফুল", illustrationId: "KopouFlower", place: { labelEn: "The courtyard", labelLocal: "চোতাল", illustrationId: "SunRise" }, similarGroup: "green" },
    { id: "dhol", labelKey: "object.dhol", labelEn: "Dhol", labelLocal: "ঢোল", illustrationId: "Dhol", place: { labelEn: "Living room", labelLocal: "বহিবৰ কোঠা", illustrationId: "FamilyTogether" } },
    { id: "pot", labelKey: "object.pot", labelEn: "Water pot", labelLocal: "কলহ", illustrationId: "WaterPot", place: { labelEn: "Kitchen shelf", labelLocal: "ৰান্ধনি ঘৰৰ তাক", illustrationId: "House" }, similarGroup: "brass" },
    { id: "jaapi", labelKey: "object.jaapi", labelEn: "Jaapi", labelLocal: "জাপি", illustrationId: "Jaapi", place: { labelEn: "Door hook", labelLocal: "দুৱাৰৰ হুক", illustrationId: "House" }, similarGroup: "bamboo" },
    { id: "xorai", labelKey: "object.xorai", labelEn: "Xorai", labelLocal: "শৰাই", illustrationId: "Xorai", place: { labelEn: "The prayer corner", labelLocal: "পূজাৰ ঠাই", illustrationId: "Namghar" }, similarGroup: "brass" },
    { id: "glass", labelKey: "object.glass", labelEn: "Glass of water", labelLocal: "পানীৰ গিলাচ", illustrationId: "WaterGlass", place: { labelEn: "The table", labelLocal: "মেজত", illustrationId: "Plate" }, similarGroup: "brass" },
  ],
  places: [
    { id: "brahmaputra", labelEn: "The Brahmaputra", labelLocal: "লুইত", noteEn: "The great river at the edge of the town." },
    { id: "tea-garden", labelEn: "The tea garden", labelLocal: "চাহ বাগিচা" },
    { id: "kaziranga", labelEn: "Kaziranga", labelLocal: "কাজিৰঙা", noteEn: "The grassland where the one-horned rhino lives." },
    { id: "majuli", labelEn: "Majuli", labelLocal: "মাজুলী", noteEn: "The river island of satras and mask-making." },
    { id: "namghar", labelEn: "The namghar", labelLocal: "নামঘৰ", noteEn: "The village prayer house — mention gently, as a familiar place." },
  ],
  festivals: [
    { id: "rongali-bihu", labelEn: "Bohag (Rongali) Bihu", labelLocal: "বহাগ বিহু", noteEn: "Spring new-year — dhol, pepa and the first husori." },
    { id: "bhogali-bihu", labelEn: "Magh (Bhogali) Bihu", labelLocal: "মাঘ বিহু", noteEn: "The harvest feast, meji bonfires and pitha." },
    { id: "kongali-bihu", labelEn: "Kati (Kongali) Bihu", labelLocal: "কাতি বিহু", noteEn: "The quiet Bihu — a lamp by the tulsi." },
  ],
  foods: [
    { id: "pitha", labelEn: "Pitha", labelLocal: "পিঠা" },
    { id: "til-laru", labelEn: "Til laru", labelLocal: "তিল লাৰু" },
    { id: "masor-tenga", labelEn: "Masor tenga", labelLocal: "মাছৰ টেঙা" },
    { id: "jolpan", labelEn: "Jolpan", labelLocal: "জলপান", noteEn: "Morning rice with curd, cream or jaggery." },
  ],
  music: [
    { id: "bihu-geet", labelEn: "Bihu geet", labelLocal: "বিহুগীত" },
    { id: "pepa", labelEn: "Pepa", labelLocal: "পেঁপা", noteEn: "The buffalo-horn pipe that opens Bihu." },
    { id: "gogona", labelEn: "Gogona", labelLocal: "গগনা" },
    { id: "borgeet", labelEn: "Borgeet", labelLocal: "বৰগীত", noteEn: "Devotional songs of Sankardev." },
  ],
  patterns: [
    { id: "gamosa-motif", labelEn: "Gamosa border", labelLocal: "গামোচাৰ ফুল", noteEn: "Red woven motifs on white cotton." },
    { id: "mekhela-sador", labelEn: "Mekhela sador weave", labelLocal: "মেখেলা চাদৰ" },
    { id: "japi-weave", labelEn: "Japi weave", labelLocal: "জাপিৰ বাননি" },
  ],
  illustrationIds: [
    "TeaLeaves", "BambooBasket", "Gamosa", "Pitha", "KopouFlower", "Dhol",
    "WaterPot", "Jaapi", "Xorai", "WaterGlass", "Plate", "House", "SunRise",
    "FamilyTogether", "Namghar", "Rhino",
  ],
  culturalNotes: [
    "The namghar and Kamakhya are places of worship — name them as familiar landmarks, never as spectacle.",
    "Assam is not one community. Bodo, Mishing, Karbi, Tea-tribe and others each have distinct material.",
  ],
};
