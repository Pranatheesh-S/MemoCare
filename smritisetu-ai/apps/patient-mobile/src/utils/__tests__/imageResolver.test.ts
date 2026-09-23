import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveMemoryImage, resolveMemoryAudio, resolvePersonAvatar } from "../imageResolver";

describe("resolveMemoryImage", () => {
  it("returns explicit URI if provided", () => {
    const memory = {
      memoryId: "custom-1",
      mediaUrl: "file:///path/to/my-photo.jpg",
    };
    const resolved = resolveMemoryImage(memory);
    assert.deepEqual(resolved, { uri: "file:///path/to/my-photo.jpg" });
  });

  it("resolves family members by English and Assamese names and relationships", () => {
    // Asha / Wife
    assert.ok(resolveMemoryImage({ personName: "Asha" }));
    assert.ok(resolveMemoryImage({ relationshipEn: "Wife" }));
    assert.ok(resolveMemoryImage({ relationshipAs: "পত্নী" }));

    // Daughter / Nabanita
    assert.ok(resolveMemoryImage({ personName: "Nabanita" }));
    assert.ok(resolveMemoryImage({ relationshipEn: "Daughter" }));
    assert.ok(resolveMemoryImage({ relationshipAs: "জীয়ৰী" }));

    // Son / Bhaskar
    assert.ok(resolveMemoryImage({ personName: "Bhaskar" }));
    assert.ok(resolveMemoryImage({ relationshipEn: "Son" }));
    assert.ok(resolveMemoryImage({ relationshipAs: "পুতেক" }));

    // Grandson / Rishav
    assert.ok(resolveMemoryImage({ personName: "Rishav" }));
    assert.ok(resolveMemoryImage({ relationshipEn: "Grandson" }));
    assert.ok(resolveMemoryImage({ relationshipAs: "নাতি" }));
  });

  it("resolves categories and places appropriately", () => {
    // Home
    assert.ok(resolveMemoryImage({ category: "MY_HOME" as any, titleEn: "Our house" }));

    // Festivals
    assert.ok(resolveMemoryImage({ category: "MY_FESTIVALS" as any, titleEn: "Bihu festival" }));

    // Places / Tea Garden
    assert.ok(resolveMemoryImage({ category: "MY_PLACES" as any, titleEn: "Jorhat Tea Garden" }));

    // Happy moments / Wedding
    assert.ok(resolveMemoryImage({ category: "HAPPY_MOMENTS" as any, titleEn: "Family Wedding" }));

    // My Songs / Kar Porokh
    assert.ok(resolveMemoryImage({ category: "MY_SONGS" as any, titleEn: "Kar Porokh" }));
    assert.ok(resolveMemoryImage({ titleAs: "কাৰ পৰশ" }));
  });

  it("returns null for unknown/unmatched memories with no image so upload pending can be shown", () => {
    const memory = {
      memoryId: "unknown-person",
      personName: "Stranger Without Photo",
      titleEn: "Some random custom event",
    };
    assert.equal(resolveMemoryImage(memory), null);
  });
});

describe("resolveMemoryAudio", () => {
  it("resolves Kar Porokh audio for MY_SONGS or Kar Porokh memory", () => {
    assert.ok(resolveMemoryAudio({ category: "MY_SONGS" as any, titleEn: "Kar Porokh" }));
    assert.ok(resolveMemoryAudio({ titleAs: "কাৰ পৰশ" }));
    assert.ok(resolveMemoryAudio({ memoryId: "demo-kar-porokh" }));
  });

  it("returns explicit voiceLocalPath or voiceUrl if provided", () => {
    assert.equal(resolveMemoryAudio({ voiceLocalPath: "file:///voice.wav" }), "file:///voice.wav");
    assert.equal(resolveMemoryAudio({ voiceUrl: "https://example.com/voice.wav" }), "https://example.com/voice.wav");
  });
});

describe("resolvePersonAvatar", () => {
  it("resolves avatar for family members by name or relationship", () => {
    assert.ok(resolvePersonAvatar("Nabanita", "Daughter"));
    assert.ok(resolvePersonAvatar("Bhaskar", "Son"));
    assert.ok(resolvePersonAvatar("Rishav", "Grandson"));
    assert.ok(resolvePersonAvatar("Asha", "Wife"));
  });

  it("returns null for unknown names with no custom photo", () => {
    assert.equal(resolvePersonAvatar("Unknown Doctor"), null);
  });
});
