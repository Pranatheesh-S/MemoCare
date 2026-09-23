import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  hasStaticVoice,
  languagesWithStaticVoice,
  staticVoiceCount,
  staticVoiceFor,
  voiceAssetKey,
} from "../voiceRegistry";

describe("the static voice registry", () => {
  it("keys a clip by language and narration key together", () => {
    assert.equal(voiceAssetKey("common.back", "en"), "en:common.back");
    assert.equal(voiceAssetKey("common.back", "as"), "as:common.back");
  });

  it("never answers with another language's recording", () => {
    // English audio over an Assamese screen would be worse than the device's
    // own Assamese-adjacent voice, which is what the app falls back to.
    assert.notEqual(voiceAssetKey("common.back", "en"), voiceAssetKey("common.back", "as"));
  });

  it("reports no clip rather than throwing when none was generated", () => {
    assert.equal(staticVoiceFor("common.back", "en"), null);
    assert.equal(hasStaticVoice("common.back", "en"), false);
  });

  it("starts empty, so a fresh clone builds and falls back to the device voice", () => {
    assert.equal(staticVoiceCount(), 0);
    assert.deepEqual(languagesWithStaticVoice(), []);
  });
});
