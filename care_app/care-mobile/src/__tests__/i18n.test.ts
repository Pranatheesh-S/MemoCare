import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LANGS, LANG_NATIVE_NAME, isLang, stateLang } from "../i18n/langs";
import { STRINGS, translate } from "../i18n/strings";

describe("langs", () => {
  it("is English plus the eight NE languages", () => {
    assert.equal(LANGS[0], "en");
    assert.equal(LANGS.length, 9);
    for (const l of LANGS) assert.ok(LANG_NATIVE_NAME[l], `missing native name for ${l}`);
  });

  it("isLang guards unknown codes", () => {
    assert.ok(isLang("as"));
    assert.ok(!isLang("fr"));
    assert.ok(!isLang(null));
  });

  it("stateLang maps a state to its language, else English", () => {
    assert.equal(stateLang("AS"), "as");
    assert.equal(stateLang("MN"), "mni");
    assert.equal(stateLang("SK"), "ne");
    // @ts-expect-error — exercising the fallback
    assert.equal(stateLang("ZZ"), "en");
  });
});

describe("translate", () => {
  it("returns the language string when present", () => {
    assert.equal(translate("as", "nav.patients"), STRINGS["nav.patients"].as);
    assert.equal(translate("en", "nav.patients"), "Patients");
  });

  it("falls back to English when the language has no entry", () => {
    // dash.emptyBody is English-only
    assert.equal(translate("as", "dash.emptyBody"), STRINGS["dash.emptyBody"].en);
  });

  it("falls back to the key itself for an unknown key", () => {
    assert.equal(translate("en", "nope.nope"), "nope.nope");
  });

  it("interpolates {{vars}}", () => {
    assert.equal(translate("en", "routine.item", { n: 3 }), "ITEM 3");
    assert.equal(translate("en", "dash.summary", { count: 2, paired: 1 }), "2 patients · 1 paired");
  });

  it("every entry has an English value", () => {
    for (const [key, entry] of Object.entries(STRINGS)) {
      assert.equal(typeof entry.en, "string", `${key} missing en`);
      assert.ok(entry.en.length > 0, `${key} empty en`);
    }
  });
});
