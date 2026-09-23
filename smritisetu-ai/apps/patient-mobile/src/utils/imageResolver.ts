import type { ImageSourcePropType } from "react-native";
import type { CachedMemory } from "../db/repositories/memoryRepository";
import {
  asha,
  daughter,
  grandson,
  son,
  patient,
  joyfulGrandmotherInASaree,
  home,
  jorhatHouse,
  festival,
  teaGarden,
  river,
  wedding,
} from "../assets/embeddedAssets";
import { karPorokhImage, karPorokhAudio } from "../assets/songAssets";

function hasWordOrId(text: string, terms: string[]): boolean {
  for (const term of terms) {
    if (term.includes("-") || term.includes(" ") || /[\u0980-\u09FF]/.test(term)) {
      if (text.toLowerCase().includes(term.toLowerCase())) return true;
    } else {
      const regex = new RegExp(`\\b${term}\\b`, "i");
      if (regex.test(text)) return true;
    }
  }
  return false;
}

/**
 * Resolves an appropriate image source for a memory.
 *
 * 1. Returns localPath or mediaUrl if already provided and valid.
 * 2. If missing or invalid, intelligently matches existing embedded assets
 *    by person name, relationship, title, category, or ID (in both English and Assamese).
 * 3. Returns null if no matching photo exists anywhere in the app, allowing
 *    screens to display a friendly "Upload pending" state.
 */
export function resolveMemoryImage(
  memory?: Partial<CachedMemory> | null,
): ImageSourcePropType | null {
  if (!memory) return null;

  // 1. Direct explicit URI
  const directUri = memory.localPath ?? memory.mediaUrl;
  if (
    directUri &&
    typeof directUri === "string" &&
    directUri.trim().length > 0 &&
    !directUri.startsWith("kar_porokh")
  ) {
    return { uri: directUri };
  }

  // 2. Intelligent keyword and category matching
  const searchCorpus = [
    memory.personName,
    memory.relationshipEn,
    memory.relationshipAs,
    memory.titleEn,
    memory.titleAs,
    memory.memoryId,
  ]
    .filter(Boolean)
    .join(" ");

  // Family / People matching
  if (hasWordOrId(searchCorpus, ["asha", "wife", "পত্নী", "seed-1", "demo-asha"])) {
    return asha;
  }

  if (hasWordOrId(searchCorpus, ["daughter", "nabanita", "জীয়ৰী", "seed-2", "demo-nabanita"])) {
    return daughter;
  }

  if (hasWordOrId(searchCorpus, ["grandson", "rishav", "নাতি", "seed-3", "demo-rishav"])) {
    return grandson;
  }

  if (hasWordOrId(searchCorpus, ["son", "bhaskar", "পুতেক", "seed-4", "demo-bhaskar"])) {
    return son;
  }

  if (hasWordOrId(searchCorpus, ["aita", "grandmother", "আইতা", "patient"])) {
    return patient ?? joyfulGrandmotherInASaree;
  }

  // Categories & Scenes matching
  if (
    memory.category === "MY_HOME" ||
    hasWordOrId(searchCorpus, ["house", "home", "ghor", "ঘৰ", "verandah", "demo-home"])
  ) {
    return home ?? jorhatHouse;
  }

  if (
    memory.category === "MY_FESTIVALS" ||
    hasWordOrId(searchCorpus, ["bihu", "festival", "বিহু", "উৎসৱ", "demo-festival"])
  ) {
    return festival;
  }

  if (
    hasWordOrId(searchCorpus, ["tea garden", "teagarden", "বাগিছা", "demo-teagarden"])
  ) {
    return teaGarden;
  }

  if (
    hasWordOrId(searchCorpus, ["river", "brahmaputra", "majuli", "নদী", "মাজুলি", "demo-river"])
  ) {
    return river;
  }

  if (
    memory.category === "MY_PLACES" &&
    hasWordOrId(searchCorpus, ["place", "ঠাই", "garden", "river", "sunset"])
  ) {
    return teaGarden ?? river;
  }

  if (
    memory.category === "HAPPY_MOMENTS" ||
    hasWordOrId(searchCorpus, ["wedding", "celebration", "বিয়া", "demo-wedding"])
  ) {
    return wedding;
  }

  if (
    memory.category === "MY_SONGS" ||
    hasWordOrId(searchCorpus, [
      "kar porokh",
      "kar parah",
      "kar",
      "porokh",
      "parah",
      "কাৰ পৰশ",
      "zubeen",
      "song",
      "গান",
      "demo-song",
      "demo-kar-porokh",
    ])
  ) {
    return karPorokhImage;
  }

  // No matching image in bundled assets
  return null;
}

/**
 * Resolves an audio source (asset require ID or URI string) for a song or voice clip.
 */
export function resolveMemoryAudio(
  memory?: Partial<CachedMemory> | null,
): number | string | null {
  if (!memory) return null;

  if (memory.voiceLocalPath && memory.voiceLocalPath.trim().length > 0) {
    return memory.voiceLocalPath;
  }
  if (
    memory.voiceUrl &&
    memory.voiceUrl.trim().length > 0 &&
    !memory.voiceUrl.startsWith("kar_porokh")
  ) {
    return memory.voiceUrl;
  }

  const searchCorpus = [
    memory.titleEn,
    memory.titleAs,
    memory.category,
    memory.memoryId,
  ]
    .filter(Boolean)
    .join(" ");

  if (
    memory.category === "MY_SONGS" ||
    hasWordOrId(searchCorpus, [
      "kar porokh",
      "kar parah",
      "kar",
      "porokh",
      "parah",
      "কাৰ পৰশ",
      "zubeen",
      "song",
      "গান",
      "demo-song",
      "demo-kar-porokh",
    ])
  ) {
    return karPorokhAudio;
  }

  return null;
}

/**
 * Resolves an avatar source for a contact (Phone / Call Family / Help screens).
 */
export function resolvePersonAvatar(
  name?: string | null,
  relationship?: string | null,
  photoUrl?: string | null,
): ImageSourcePropType | null {
  // If a valid custom photoUrl is given (and not a dummy/broken URL)
  if (photoUrl && typeof photoUrl === "string" && photoUrl.trim().length > 0 && !photoUrl.includes("pravatar.cc")) {
    return { uri: photoUrl };
  }

  const corpus = `${name ?? ""} ${relationship ?? ""}`;

  if (hasWordOrId(corpus, ["asha", "wife", "পত্নী"])) {
    return asha;
  }
  if (hasWordOrId(corpus, ["daughter", "nabanita", "জীয়ৰী"])) {
    return daughter;
  }
  if (hasWordOrId(corpus, ["grandson", "rishav", "নাতি"])) {
    return grandson;
  }
  if (hasWordOrId(corpus, ["son", "bhaskar", "পুতেক"])) {
    return son;
  }
  if (hasWordOrId(corpus, ["aita", "grandmother", "আইতা", "patient"])) {
    return joyfulGrandmotherInASaree ?? patient;
  }

  if (photoUrl && typeof photoUrl === "string" && photoUrl.trim().length > 0) {
    return { uri: photoUrl };
  }

  return null;
}
