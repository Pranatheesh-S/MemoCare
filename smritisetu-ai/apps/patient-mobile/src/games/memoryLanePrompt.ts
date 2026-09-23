import type { SupportedLanguage } from "@smritisetu/shared-types";
import type { CachedMemory } from "../db/repositories/memoryRepository";

export type GuidedPrompt = {
  key: "memoryLane.guidedPrompt";
  params: { name: string; relationshipClause: string; sceneClause: string };
};

/**
 * Builds a spoken reminiscence prompt from labels already stored on the memory.
 * Presentation only — the Memory Lane session logic is untouched.
 *
 * The memory carries one secondary-language column (`titleAs` etc.); any UI
 * language other than English reads it.
 */
export function composeGuidedPrompt(
  memory: CachedMemory,
  language: SupportedLanguage,
): GuidedPrompt {
  const inLocal = language !== "en";
  const title = inLocal && memory.titleAs ? memory.titleAs : memory.titleEn;
  const name = memory.personName?.trim() || title;
  const relationship = (inLocal ? memory.relationshipAs : memory.relationshipEn)?.trim()
    || memory.relationshipEn?.trim();
  const scene = (inLocal ? memory.captionAs : memory.captionEn)?.trim()
    || memory.captionEn?.trim();

  const relationshipClause = relationship
    ? language === "as"
      ? `, আপোনাৰ ${relationship}`
      : `, your ${relationship}`
    : "";
  const sceneClause = scene ? `, ${scene}` : "";

  return {
    key: "memoryLane.guidedPrompt",
    params: { name, relationshipClause, sceneClause },
  };
}
