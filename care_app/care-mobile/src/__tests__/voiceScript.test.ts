import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  VOICE_SAMPLE_MAX_BASE64,
  VOICE_SAMPLE_MAX_SECONDS,
  VOICE_SAMPLE_MIN_SECONDS,
  VOICE_SAMPLE_SCRIPT,
  VOICE_SAMPLE_TRANSCRIPT,
  checkVoiceSample,
  formatDuration,
  voiceSampleWordCount,
} from "../voiceScript";

describe("voice sample script", () => {
  it("is the 14 lines the caregiver reads, all non-empty", () => {
    assert.equal(VOICE_SAMPLE_SCRIPT.length, 14);
    for (const line of VOICE_SAMPLE_SCRIPT) {
      assert.equal(typeof line, "string");
      assert.ok(line.trim().length > 10, `too short: "${line}"`);
    }
  });

  it("uses the Remi name, never the old one", () => {
    assert.match(VOICE_SAMPLE_TRANSCRIPT, /Remi/);
    assert.doesNotMatch(VOICE_SAMPLE_TRANSCRIPT.toLowerCase(), /smriti/);
  });

  it("transcript is the lines joined by a space", () => {
    assert.equal(VOICE_SAMPLE_TRANSCRIPT, VOICE_SAMPLE_SCRIPT.join(" "));
  });

  it("is a realistic length to read aloud in a minute (roughly 120-230 words)", () => {
    const words = voiceSampleWordCount();
    assert.ok(words >= 120 && words <= 230, `word count out of band: ${words}`);
  });
});

describe("checkVoiceSample", () => {
  it("rejects a take shorter than the minimum", () => {
    const r = checkVoiceSample(VOICE_SAMPLE_MIN_SECONDS - 5, 1000);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /more lines/);
  });

  it("rejects a recording whose base64 would blow the doc limit", () => {
    const r = checkVoiceSample(45, VOICE_SAMPLE_MAX_BASE64 + 1);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /too large/);
  });

  it("accepts a normal 45s take", () => {
    assert.deepEqual(checkVoiceSample(45, 300_000), { ok: true });
  });

  it("accepts exactly the max duration", () => {
    assert.equal(checkVoiceSample(VOICE_SAMPLE_MAX_SECONDS, 320_000).ok, true);
  });
});

describe("formatDuration", () => {
  it("renders mm:ss and clamps negatives", () => {
    assert.equal(formatDuration(0), "0:00");
    assert.equal(formatDuration(9), "0:09");
    assert.equal(formatDuration(64), "1:04");
    assert.equal(formatDuration(-3), "0:00");
  });
});
