import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUNDLED_TRANSLATIONS, FALLBACK_LANGUAGE } from "../translations";
import { greetingKeyForHour, interpolate, resolveTranslation, translate } from "../translate";

describe("translation fallback", () => {
  it("prefers a downloaded string over the bundled one", () => {
    const result = resolveTranslation("home.playGames", "as", {
      "home.playGames": "downloaded value",
    });
    assert.equal(result.value, "downloaded value");
    assert.equal(result.usedFallback, false);
  });

  it("uses the bundled string when nothing is downloaded", () => {
    const result = resolveTranslation("home.playGames", "as", null);
    assert.equal(result.value, BUNDLED_TRANSLATIONS.as["home.playGames"]);
    assert.equal(result.usedFallback, false);
  });

  it("falls back to English for a key missing from Assamese", () => {
    // Simulates a partially translated downloaded pack.
    const result = resolveTranslation("home.playGames", "as", { "some.other.key": "x" });
    // The bundled Assamese string still wins over English.
    assert.equal(result.value, BUNDLED_TRANSLATIONS.as["home.playGames"]);
  });

  it("shows a real English sentence rather than a raw key", () => {
    const partial = { ...BUNDLED_TRANSLATIONS.as };
    delete (partial as Record<string, string>)["home.playGames"];

    // With the Assamese entry absent everywhere, English carries the screen.
    const value = resolveTranslation("home.playGames", "en", null).value;
    assert.equal(value, BUNDLED_TRANSLATIONS.en["home.playGames"]);
    assert.notEqual(value, "home.playGames");
  });

  it("treats an empty string as missing", () => {
    const result = resolveTranslation("home.playGames", "as", { "home.playGames": "" });
    assert.notEqual(result.value, "");
    assert.equal(result.value, BUNDLED_TRANSLATIONS.as["home.playGames"]);
  });

  it("surfaces an unknown key as itself, so it is visible in development", () => {
    const result = resolveTranslation("no.such.key", "en", null);
    assert.equal(result.value, "no.such.key");
    assert.equal(result.usedFallback, true);
  });

  it("marks that a fallback was used when Assamese was requested", () => {
    const result = resolveTranslation("no.such.key", "as", null);
    assert.equal(result.usedFallback, true);
  });
});

describe("translation completeness", () => {
  it("has an Assamese entry for every English key", () => {
    const missing = Object.keys(BUNDLED_TRANSLATIONS.en).filter(
      (key) => !(key in BUNDLED_TRANSLATIONS.as),
    );
    assert.deepEqual(missing, [], "every key must exist in as.json");
  });

  it("carries no empty strings in either language", () => {
    for (const [language, table] of Object.entries(BUNDLED_TRANSLATIONS)) {
      for (const [key, value] of Object.entries(table)) {
        if (key.startsWith("_meta")) continue;
        assert.ok(value.length > 0, `${language}.${key} is empty`);
      }
    }
  });

  it("marks the Assamese file as awaiting native review", () => {
    // The prototype's Assamese strings must stay flagged until a native
    // speaker has verified them.
    const meta = (BUNDLED_TRANSLATIONS.as as Record<string, string>)["_meta.status"];
    assert.equal(meta, "PLACEHOLDER_PENDING_NATIVE_REVIEW");
  });

  it("uses English as the fallback language", () => {
    assert.equal(FALLBACK_LANGUAGE, "en");
  });

  it("keeps placeholders consistent between languages", () => {
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

    for (const [key, english] of Object.entries(BUNDLED_TRANSLATIONS.en)) {
      const assamese = BUNDLED_TRANSLATIONS.as[key];
      if (!assamese) continue;
      assert.deepEqual(
        placeholders(assamese),
        placeholders(english),
        `placeholders differ for ${key}`,
      );
    }
  });

  it("never shows the patient a discouraging word", () => {
    const banned = ["wrong", "failed", "failure", "game over", "poor", "incorrect", "mistake"];
    for (const [key, value] of Object.entries(BUNDLED_TRANSLATIONS.en)) {
      const lowered = value.toLowerCase();
      for (const word of banned) {
        assert.ok(!lowered.includes(word), `en.${key} contains "${word}": ${value}`);
      }
    }
  });

  it("never tells the patient that one game is enough for the day", () => {
    const lowered = Object.values(BUNDLED_TRANSLATIONS.en).join(" ").toLowerCase();
    assert.equal(lowered.includes("enough for today"), false);
  });

  it("carries the supportive phrases the brief requires", () => {
    const table = BUNDLED_TRANSLATIONS.en;
    assert.match(table["games.goodAttempt"], /good attempt/i);
    assert.match(table["games.tryTogether"], /try together/i);
    assert.match(table["games.doingWell"], /doing so well|doing well/i);
    assert.match(table["games.hint"], /would you like a hint/i);
    assert.match(table["games.thankYou"], /thank you for spending time with us/i);
  });

  it("uses full appreciative sentences, not a short yay as the main line", () => {
    const keys = [
      "games.doingWell",
      "games.wellDone",
      "memoryMatch.matched",
      "memoryMatch.enoughForToday",
      "memoryMatch.nextRound",
      "routineBuilder.correct",
      "whoIsThis.correct",
    ] as const;

    for (const key of keys) {
      const value = BUNDLED_TRANSLATIONS.en[key];
      const words = value.trim().split(/\s+/);
      assert.ok(words.length >= 10, `${key} should have many words: ${value}`);
      assert.equal(/^yay\b/i.test(value), false, `${key} should not start with yay`);
    }

    const praise = keys.map((key) => BUNDLED_TRANSLATIONS.en[key]).join(" ").toLowerCase();
    assert.ok(praise.includes("so well") || praise.includes("so glad") || praise.includes("so nice"));
    assert.equal(praise.includes("lovely"), false);
    assert.equal(praise.includes("wonderful"), false);
    assert.equal(praise.includes("marvellous"), false);
    assert.equal(praise.includes("splendid"), false);
    assert.equal(praise.includes("brilliant"), false);
  });
});

describe("interpolation", () => {
  it("substitutes named placeholders", () => {
    assert.equal(interpolate("Good morning, {{name}}", { name: "Aita" }), "Good morning, Aita");
  });

  it("substitutes several placeholders", () => {
    assert.equal(
      interpolate("Next: {{title}} at {{time}}", { title: "Tea", time: "5 pm" }),
      "Next: Tea at 5 pm",
    );
  });

  it("accepts numbers", () => {
    assert.equal(interpolate("{{count}} waiting", { count: 3 }), "3 waiting");
  });

  it("removes a placeholder with no value rather than printing braces", () => {
    assert.equal(interpolate("Hello {{name}}", {}), "Hello");
    assert.equal(interpolate("Hello {{name}}"), "Hello");
  });

  it("tolerates whitespace inside the braces", () => {
    assert.equal(interpolate("Hi {{ name }}", { name: "Aita" }), "Hi Aita");
  });

  it("leaves text with no placeholders untouched", () => {
    assert.equal(interpolate("Play Games", { name: "Aita" }), "Play Games");
  });

  it("translates and interpolates together", () => {
    const greeting = translate("home.greeting.morning", "en", { name: "Aita" });
    assert.equal(greeting, "Good morning,\nAita");
  });

  it("interpolates the Assamese greeting too", () => {
    const greeting = translate("home.greeting.morning", "as", { name: "আইতা" });
    assert.ok(greeting.includes("আইতা"));
    assert.ok(!greeting.includes("{{"));
  });
});

describe("time-based greeting", () => {
  it("chooses a greeting for each part of the day", () => {
    assert.equal(greetingKeyForHour(7), "home.greeting.morning");
    assert.equal(greetingKeyForHour(13), "home.greeting.afternoon");
    assert.equal(greetingKeyForHour(19), "home.greeting.evening");
    assert.equal(greetingKeyForHour(23), "home.greeting.night");
  });

  it("covers every hour of the day", () => {
    for (let hour = 0; hour < 24; hour++) {
      const key = greetingKeyForHour(hour);
      assert.ok(BUNDLED_TRANSLATIONS.en[key], `hour ${hour} maps to a missing key`);
    }
  });
});
