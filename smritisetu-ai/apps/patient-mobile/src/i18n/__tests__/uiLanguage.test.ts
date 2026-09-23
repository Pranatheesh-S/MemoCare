import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { nextUiLanguage, resolveUiLanguage } from "../uiLanguage";

describe("UI language", () => {
  it("starts in English when nothing has been chosen yet", () => {
    assert.equal(resolveUiLanguage(null), "en");
    assert.equal(resolveUiLanguage(undefined), "en");
    assert.equal(resolveUiLanguage(""), "en");
    assert.equal(resolveUiLanguage("as-IN"), "en");
  });

  it("keeps Assamese only after it was chosen on the device", () => {
    assert.equal(resolveUiLanguage("as"), "as");
    assert.equal(resolveUiLanguage("en"), "en");
  });

  it("toggles between English and Assamese", () => {
    assert.equal(nextUiLanguage("en"), "as");
    assert.equal(nextUiLanguage("as"), "en");
  });
});
