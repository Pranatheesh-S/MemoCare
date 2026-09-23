import type { ContentPack } from "../types";

/**
 * Meghalaya.
 *
 * Living root bridges, rain and the knup, pine hills, and the markets of the
 * Khasi, Garo and Jaintia peoples — three distinct communities, each with its
 * own language and dress, kept separate here.
 */
export const MEGHALAYA_PACK: ContentPack = {
  stateId: "ML",
  stateName: "Meghalaya",
  blurbEn:
    "Rain, pine hills, living root bridges and hill markets. The Khasi, Garo and Jaintia are three peoples — pick the community that matches the patient.",
  languages: [
    { code: "kha", labelEn: "Khasi", labelNative: "Ka Ktien Khasi" },
    { code: "grt", labelEn: "Garo", labelNative: "A·chik" },
    { code: "en", labelEn: "English", labelNative: "English" },
  ],
  communities: [
    { id: "meghalaya.khasi", labelEn: "Khasi" },
    { id: "meghalaya.garo", labelEn: "Garo (A·chik)" },
    { id: "meghalaya.jaintia", labelEn: "Jaintia (Pnar)" },
  ],
  matchObjects: [
    { id: "knup", labelKey: "object.knup", labelEn: "Rain shield", labelLocal: "knup", illustrationId: "RainShield", place: { labelEn: "By the door", labelLocal: "door", illustrationId: "House" }, similarGroup: "cane" },
    { id: "khoh", labelKey: "object.khoh", labelEn: "Carrying basket", labelLocal: "khoh", illustrationId: "BambooBasket", place: { labelEn: "On the back porch", labelLocal: "porch", illustrationId: "House" }, similarGroup: "cane" },
    { id: "jainsem", labelKey: "object.jainsem", labelEn: "Jainsem", labelLocal: "jainsem", illustrationId: "HandloomShawl", place: { labelEn: "Folded on the bed", labelLocal: "bed", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "dakmanda", labelKey: "object.dakmanda", labelEn: "Dakmanda", labelLocal: "dakmanda", illustrationId: "Phanek", place: { labelEn: "In the wooden chest", labelLocal: "chest", illustrationId: "House" }, similarGroup: "cloth" },
    { id: "root-bridge", labelKey: "object.rootBridge", labelEn: "Living root bridge", labelLocal: "jingkieng jri", illustrationId: "RootBridge", place: { labelEn: "Across the stream", labelLocal: "stream", illustrationId: "PineHill" } },
    { id: "pine", labelKey: "object.pine", labelEn: "Pine branch", labelLocal: "dieng ksular", illustrationId: "PineHill", place: { labelEn: "On the ridge", labelLocal: "ridge", illustrationId: "Mountains" }, similarGroup: "green" },
    { id: "kwai", labelKey: "object.kwai", labelEn: "Betel nut", labelLocal: "kwai", illustrationId: "Plate", place: { labelEn: "The brass box", labelLocal: "box", illustrationId: "WaterPot" }, similarGroup: "vessel" },
    { id: "rice-beer-pot", labelKey: "object.riceBeerPot", labelEn: "Rice pot", labelLocal: "khiew", illustrationId: "WaterPot", place: { labelEn: "The hearth", labelLocal: "hearth", illustrationId: "Plate" }, similarGroup: "vessel" },
  ],
  places: [
    { id: "root-bridges", labelEn: "The root bridges", labelLocal: "jingkieng jri", noteEn: "Bridges grown from rubber-fig roots over generations." },
    { id: "sohra", labelEn: "Sohra (Cherrapunji)", labelLocal: "Sohra" },
    { id: "iewduh", labelEn: "Iewduh market", labelLocal: "Iewduh", noteEn: "Shillong's big market." },
    { id: "umiam", labelEn: "Umiam lake", labelLocal: "Umiam" },
    { id: "sacred-grove", labelEn: "The sacred grove", labelLocal: "law kyntang", noteEn: "Mawphlang's protected forest — a place of respect." },
  ],
  festivals: [
    { id: "nongkrem", labelEn: "Ka Pomblang Nongkrem", labelLocal: "Nongkrem" },
    { id: "shad-suk-mynsiem", labelEn: "Shad Suk Mynsiem", labelLocal: "Shad Suk Mynsiem", noteEn: "The Khasi spring thanksgiving dance." },
    { id: "wangala", labelEn: "Wangala", labelLocal: "Wangala", noteEn: "The Garo hundred-drums harvest festival." },
    { id: "behdienkhlam", labelEn: "Behdienkhlam", labelLocal: "Behdienkhlam", noteEn: "Jaintia monsoon festival." },
  ],
  foods: [
    { id: "jadoh", labelEn: "Jadoh", labelLocal: "jadoh", noteEn: "Red rice cooked with meat." },
    { id: "tungrymbai", labelEn: "Tungrymbai", labelLocal: "tungrymbai" },
    { id: "pumaloi", labelEn: "Pumaloi", labelLocal: "putharo" },
    { id: "nakham-bitchi", labelEn: "Nakham bitchi", labelLocal: "nakham bitchi", noteEn: "Garo dried-fish soup." },
  ],
  music: [
    { id: "ksing", labelEn: "Ksing drums", labelLocal: "ksing" },
    { id: "duitara", labelEn: "Duitara", labelLocal: "duitara", noteEn: "A four-string wooden lute." },
    { id: "wangala-drums", labelEn: "Wangala drums", labelLocal: "dama" },
  ],
  patterns: [
    { id: "khasi-check", labelEn: "Jainsem check", labelLocal: "jainsem" },
    { id: "dakmanda-weave", labelEn: "Dakmanda border", labelLocal: "dakmanda" },
    { id: "eri-silk", labelEn: "Eri silk", labelLocal: "ryndia" },
  ],
  illustrationIds: [
    "RainShield", "BambooBasket", "HandloomShawl", "Phanek", "RootBridge",
    "PineHill", "Plate", "WaterPot", "House", "Mountains",
  ],
  culturalNotes: [
    "Khasi, Garo and Jaintia are separate peoples with separate languages — never one 'Meghalaya' culture.",
    "Sacred groves and Nongkrem are matrilineal-clan religious ground; name them with respect.",
  ],
};
