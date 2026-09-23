import type { ContentPack } from "../types";

/**
 * Sikkim.
 *
 * Kanchenjunga watching over the valley, cardamom terraces, prayer flags and
 * chortens, and the mixed home life of the Lepcha, Bhutia and Nepali
 * communities. Monasteries and Buddhist objects are shown as familiar
 * landmarks, with care.
 */
export const SIKKIM_PACK: ContentPack = {
  stateId: "SK",
  stateName: "Sikkim",
  blurbEn:
    "Mountain valleys under Kanchenjunga — cardamom, prayer flags, chortens, and the shared home life of Lepcha, Bhutia and Nepali families.",
  languages: [
    { code: "ne", labelEn: "Nepali", labelNative: "नेपाली" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "sikkim.nepali", labelEn: "Nepali (Gorkha)" },
    { id: "sikkim.bhutia", labelEn: "Bhutia" },
    { id: "sikkim.lepcha", labelEn: "Lepcha (Rong)", noteEn: "The indigenous people of Sikkim; own language and weave." },
    { id: "sikkim.limbu", labelEn: "Limbu (Subba)" },
  ],
  matchObjects: [
    { id: "prayer-flags", labelKey: "object.prayerFlags", labelEn: "Prayer flags", labelLocal: "lungta", illustrationId: "PrayerFlags", place: { labelEn: "Along the ridge", labelLocal: "ridge", illustrationId: "SnowPeak" } },
    { id: "chorten", labelKey: "object.chorten", labelEn: "Chorten", labelLocal: "chorten", illustrationId: "Chorten", place: { labelEn: "On the monastery path", labelLocal: "path", illustrationId: "PineHill" } },
    { id: "snow-peak", labelKey: "object.snowPeak", labelEn: "Kanchenjunga", labelLocal: "Kanchenjunga", illustrationId: "SnowPeak", place: { labelEn: "Above the valley", labelLocal: "valley", illustrationId: "PineHill" } },
    { id: "cardamom", labelKey: "object.cardamom", labelEn: "Large cardamom", labelLocal: "alaichi", illustrationId: "Plate", place: { labelEn: "Drying in the shed", labelLocal: "shed", illustrationId: "House" }, similarGroup: "green" },
    { id: "rhododendron", labelKey: "object.rhododendron", labelEn: "Rhododendron", labelLocal: "gurans", illustrationId: "KopouFlower", place: { labelEn: "On the hill slope", labelLocal: "slope", illustrationId: "SnowPeak" }, similarGroup: "green" },
    { id: "bakhu", labelKey: "object.bakhu", labelEn: "Bakhu", labelLocal: "bakhu", illustrationId: "HandloomShawl", place: { labelEn: "Folded on the bed", labelLocal: "bed", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "pangden", labelKey: "object.pangden", labelEn: "Pangden apron", labelLocal: "pangden", illustrationId: "Phanek", place: { labelEn: "In the wooden chest", labelLocal: "chest", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "momo-bowl", labelKey: "object.momoBowl", labelEn: "Momo bowl", labelLocal: "bowl", illustrationId: "WaterPot", place: { labelEn: "The kitchen shelf", labelLocal: "shelf", illustrationId: "Plate" }, similarGroup: "vessel" },
  ],
  places: [
    { id: "kanchenjunga", labelEn: "Kanchenjunga", labelLocal: "Kanchenjunga", noteEn: "The guardian mountain; spoken of with respect." },
    { id: "rumtek", labelEn: "Rumtek monastery", labelLocal: "Rumtek", noteEn: "A familiar landmark near Gangtok — name it gently." },
    { id: "tsomgo", labelEn: "Tsomgo lake", labelLocal: "Tsomgo" },
    { id: "cardamom-terrace", labelEn: "The cardamom terraces", labelLocal: "alaichi bari" },
    { id: "pelling", labelEn: "Pelling", labelLocal: "Pelling" },
  ],
  festivals: [
    { id: "losar", labelEn: "Losar", labelLocal: "Losar", noteEn: "Tibetan/Bhutia new year." },
    { id: "pang-lhabsol", labelEn: "Pang Lhabsol", labelLocal: "Pang Lhabsol", noteEn: "Honouring Kanchenjunga as guardian deity." },
    { id: "dashain-tihar", labelEn: "Dashain and Tihar", labelLocal: "Dashain, Tihar" },
    { id: "maghe-sankranti", labelEn: "Maghe Sankranti", labelLocal: "Maghe Sankranti" },
  ],
  foods: [
    { id: "momo", labelEn: "Momo", labelLocal: "momo" },
    { id: "thukpa", labelEn: "Thukpa", labelLocal: "thukpa" },
    { id: "gundruk", labelEn: "Gundruk", labelLocal: "gundruk" },
    { id: "sel-roti", labelEn: "Sel roti", labelLocal: "sel roti" },
    { id: "churpi", labelEn: "Churpi", labelLocal: "churpi" },
  ],
  music: [
    { id: "tamang-selo", labelEn: "Tamang selo", labelLocal: "selo", noteEn: "Sung to the damphu hand-drum." },
    { id: "maruni", labelEn: "Maruni dance", labelLocal: "Maruni" },
    { id: "singhi-chham", labelEn: "Singhi Chham", labelLocal: "Singhi Chham", noteEn: "The snow-lion dance." },
  ],
  patterns: [
    { id: "lepcha-weave", labelEn: "Lepcha weave", labelLocal: "thara" },
    { id: "bhutia-carpet", labelEn: "Bhutia carpet motifs", labelLocal: "denzong" },
    { id: "dhaka-weave", labelEn: "Dhaka weave", labelLocal: "dhaka" },
  ],
  illustrationIds: [
    "PrayerFlags", "Chorten", "SnowPeak", "Plate", "KopouFlower",
    "HandloomShawl", "Phanek", "WaterPot", "PineHill", "House",
  ],
  culturalNotes: [
    "Chortens, prayer flags and monasteries are living religious objects — never props; place them in their real setting.",
    "The Lepcha are indigenous to Sikkim with a distinct language and weave; do not fold them into 'Nepali Sikkim'.",
  ],
};
