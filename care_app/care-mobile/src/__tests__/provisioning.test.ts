import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  codeExpiry,
  formatCode,
  generateCode,
  isExpired,
  isValidCode,
  normaliseCode,
} from "../codes";
import {
  cleanContacts,
  cleanMemories,
  emptyMemoryDraft,
  emptyPatientDraft,
  NE_STATES,
  stateById,
  validatePatientDraft,
} from "../model";

describe("pairing codes", () => {
  it("generates a code of the right length from the unambiguous alphabet", () => {
    const seq = [0, 0.1, 0.5, 0.99, 0.3, 0.7];
    let i = 0;
    const code = generateCode(() => seq[i++ % seq.length]);
    assert.equal(code.length, CODE_LENGTH);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `${ch} not in alphabet`);
    assert.doesNotMatch(code, /[0O1IL]/);
  });

  it("normalises what a person types before validating", () => {
    assert.equal(normaliseCode(" ab2-cd3 "), "AB2CD3");
    assert.equal(isValidCode("ab2 cd3"), true); // spaces/dashes/case are forgiven
    assert.equal(isValidCode("ab2 cd"), false); // five chars after stripping
  });

  it("accepts a well-formed code in any case with dashes/spaces", () => {
    assert.equal(isValidCode("ABC234"), true);
    assert.equal(isValidCode("abc-234"), true);
    assert.equal(isValidCode("ABC23"), false);
    assert.equal(isValidCode("ABC2O4"), false); // O is not in the alphabet
  });

  it("formats a code as XXX-XXX for display but never stores the dash", () => {
    assert.equal(formatCode("abc234"), "ABC-234");
    assert.equal(normaliseCode(formatCode("abc234")), "ABC234");
  });

  it("expiry is 30 days out and isExpired respects it", () => {
    const from = new Date("2026-08-01T00:00:00Z");
    const exp = codeExpiry(from);
    assert.equal(exp.toISOString(), "2026-08-31T00:00:00.000Z");
    assert.equal(isExpired(exp, from.getTime() + 1000), false);
    assert.equal(isExpired(exp, exp.getTime()), true);
  });
});

describe("state -> patient app theme", () => {
  it("covers all eight North-Eastern states, each with a language and accent", () => {
    assert.equal(NE_STATES.length, 8);
    for (const s of NE_STATES) {
      assert.match(s.accent, /^#[0-9A-Fa-f]{6}$/);
      assert.ok(s.language.length >= 2);
    }
    assert.equal(stateById("ML").name, "Meghalaya");
    assert.equal(stateById("ML").language, "kha");
  });
});

describe("patient draft validation", () => {
  const base = () => ({
    ...emptyPatientDraft(),
    displayName: "Aita Devi",
    preferredName: "Aita",
    age: 72,
  });

  it("passes with a name, a valid age, a state and one usable memory", () => {
    const memory = { ...emptyMemoryDraft(), title: "Tea in the garden", story: "Every evening." };
    assert.deepEqual(validatePatientDraft(base(), [memory]), []);
  });

  it("requires at least one memory with both a title and a story", () => {
    const errs = validatePatientDraft(base(), [{ ...emptyMemoryDraft(), title: "Only a title" }]);
    assert.ok(errs.some((e) => e.field === "memories"));
  });

  it("rejects an implausible age and a blank name", () => {
    const errs = validatePatientDraft({ ...base(), age: 5, displayName: "" }, [
      { ...emptyMemoryDraft(), title: "t", story: "s" },
    ]);
    assert.ok(errs.some((e) => e.field === "age"));
    assert.ok(errs.some((e) => e.field === "displayName"));
  });

  it("cleanMemories drops empties and trims, keeping family fields", () => {
    const cleaned = cleanMemories([
      { category: "MY_FAMILY", personName: " Nabanita ", relationship: " Daughter ", title: " Tea ", story: " Evening ", favourite: true },
      { category: "MY_HOME", title: "", story: "no title" },
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].personName, "Nabanita");
    assert.equal(cleaned[0].title, "Tea");
    assert.equal(cleaned[0].favourite, true);
  });

  it("cleanMemories never emits an undefined field (Firestore rejects those)", () => {
    const [m] = cleanMemories([{ category: "MY_HOME", title: "Home", story: "The verandah." }]);
    assert.ok(!("personName" in m));
    assert.ok(!("relationship" in m));
    assert.ok(!("imageUri" in m));
  });

  it("cleanMemories keeps a memory picture when one was chosen, drops a blank one", () => {
    const [withPic] = cleanMemories([
      { category: "MY_PLACES", title: "Majuli", story: "The river.", imageUri: "data:image/jpeg;base64,abc" },
    ]);
    assert.equal(withPic.imageUri, "data:image/jpeg;base64,abc");
    const [noPic] = cleanMemories([{ category: "MY_PLACES", title: "Majuli", story: "The river.", imageUri: "  " }]);
    assert.ok(!("imageUri" in noPic));
  });

  it("flags a family contact that has a name but no phone (or vice versa)", () => {
    const errs = validatePatientDraft(
      { ...base(), contacts: [{ name: "Bhaskar", relationship: "Son", phone: "" }] },
      [{ ...emptyMemoryDraft(), title: "t", story: "s" }],
    );
    assert.ok(errs.some((e) => e.field === "contacts"));
  });

  it("cleanContacts trims, normalises the phone, defaults relationship and marks the first as primary", () => {
    const cleaned = cleanContacts([
      { name: " Nabanita ", relationship: "  ", phone: " +91 (900) 000-0001 ", isPrimary: false },
      { name: "No phone", relationship: "Son", phone: "12" }, // dropped — too short
      { name: "", relationship: "x", phone: "9000000002" }, // dropped — no name
    ]);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].name, "Nabanita");
    assert.equal(cleaned[0].relationship, "Family");
    assert.equal(cleaned[0].isPrimary, true);
    assert.match(cleaned[0].phone, /^[0-9+ ()-]+$/);
  });
});
