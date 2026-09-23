import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { speechLocaleFor, speechMoodFor, speechOptionsFor, textForSpeech } from "../audioPrompts";

describe("speech options", () => {
  it("uses Indian English and a private audio session so the silent switch cannot mute it", () => {
    const options = speechOptionsFor("en");
    assert.equal(options.language, "en-IN");
    assert.equal(options.useApplicationAudioSession, false);
    assert.equal(options.volume, 1.0);
  });

  it("speaks praise slower and a little warmer than instructions", () => {
    const guide = speechOptionsFor("en", "guide");
    const cheer = speechOptionsFor("en", "cheer");
    assert.ok(cheer.rate < guide.rate);
    assert.ok(cheer.pitch > guide.pitch);
    assert.ok(cheer.rate <= 0.8);
    assert.equal(speechMoodFor("memoryMatch.matched"), "cheer");
    assert.equal(speechMoodFor("memoryMatch.instruction"), "guide");
  });

  it("maps Assamese onto the nearest available Indic voice", () => {
    assert.equal(speechLocaleFor("as"), "bn-IN");
    assert.equal(speechOptionsFor("as").language, "bn-IN");
  });
});

describe("spoken text", () => {
  it("reads a greeting as one sentence, not a line break then the name", () => {
    assert.equal(textForSpeech("Good morning,\nAita"), "Good morning, Aita");
  });

  it("collapses extra space so the same cue is not spoken twice in different wrapping", () => {
    assert.equal(textForSpeech("  Choose a card\n to begin.  "), "Choose a card to begin.");
  });
});
