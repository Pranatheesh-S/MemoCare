import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildOfflinePackageFromFirestore,
  isFirebasePairingCode,
} from "../firebasePairing";
import { isFirebaseSession } from "../../firebase/sessionSync";

describe("isFirebaseSession", () => {
  it("is true only for a firebase- pairing token", () => {
    assert.equal(isFirebaseSession("firebase-ABC234"), true);
    assert.equal(isFirebaseSession("demo-local-device-token"), false);
    assert.equal(isFirebaseSession(null), false);
    assert.equal(isFirebaseSession(undefined), false);
  });
});

describe("isFirebasePairingCode", () => {
  it("accepts a 6-char code that contains a letter, any case/spacing", () => {
    assert.equal(isFirebasePairingCode("ABC234"), true);
    assert.equal(isFirebasePairingCode("abc234"), true);
    assert.equal(isFirebasePairingCode(" ab2cd3 "), true);
  });

  it("rejects the 6-digit demo/backend code and malformed input", () => {
    assert.equal(isFirebasePairingCode("123456"), false); // pure digits -> backend path
    assert.equal(isFirebasePairingCode("ABC23"), false); // too short
    assert.equal(isFirebasePairingCode("ABC2O4"), false); // O is not in the alphabet
    assert.equal(isFirebasePairingCode("ABCD234"), false); // too long
  });
});

describe("buildOfflinePackageFromFirestore", () => {
  const now = () => "2026-08-30T09:00:00.000Z";

  it("maps the state to the content pack, theme language and location", () => {
    const pkg = buildOfflinePackageFromFirestore(
      "pat-1",
      {
        displayName: "Kong Riti",
        preferredName: "Riti",
        age: 74,
        stateId: "ML",
        village: "Sohra",
        largeText: true,
        reducedMotion: false,
        audioGuidance: true,
      },
      [],
      now,
    );

    assert.equal(pkg.patient.stateId, "ML");
    assert.equal(pkg.patient.preferredLanguage, "kha"); // Meghalaya pack language
    assert.equal(pkg.patient.location, "Sohra, Meghalaya");
    assert.equal(pkg.contentPack?.stateId, "ML");
    assert.equal(pkg.contentPack?.stateName, "Meghalaya");
    assert.equal(pkg.contentPack?.primaryLanguage, "kha");
    assert.equal(pkg.patient.largeText, true);
    assert.equal(pkg.gameConfig.games.length, 4);
    assert.equal(pkg.difficultyProfiles.length, 4);
  });

  it("falls back to Assam for an unknown state and keeps a caregiver language override", () => {
    const pkg = buildOfflinePackageFromFirestore(
      "pat-2",
      { displayName: "Someone", stateId: "ZZ", language: "en" },
      [],
      now,
    );
    assert.equal(pkg.patient.stateId, "AS");
    assert.equal(pkg.patient.preferredLanguage, "en"); // explicit override wins
    assert.equal(pkg.contentPack?.primaryLanguage, "as");
  });

  it("carries the profile photo and family contacts into the package", () => {
    const pkg = buildOfflinePackageFromFirestore(
      "pat-c",
      {
        displayName: "Aita",
        stateId: "AS",
        photoUrl: "https://firebasestorage.example/patients/pat-c/profile.jpg",
        contacts: [
          { name: "Nabanita", relationship: "Daughter", phone: "+919000000001", isPrimary: true },
          { name: "Bhaskar", relationship: "Son", phone: "+919000000003" },
          { name: "", phone: "" }, // dropped
        ],
      },
      [],
      now,
    );

    assert.equal(pkg.patient.photoUrl, "https://firebasestorage.example/patients/pat-c/profile.jpg");
    assert.equal(pkg.contacts.length, 2);
    assert.equal(pkg.contacts[0].name, "Nabanita");
    assert.equal(pkg.contacts[0].phoneNumber, "+919000000001");
    assert.equal(pkg.contacts[0].relationshipEn, "Daughter");
    assert.equal(pkg.contacts[0].isPrimary, true);
    assert.equal(pkg.contacts[1].isPrimary, false);
    assert.equal(pkg.contacts[1].displayOrder, 1);
  });

  it("has no photo and no contacts when none were provided", () => {
    const pkg = buildOfflinePackageFromFirestore("pat-d", { displayName: "X", stateId: "AS" }, [], now);
    assert.equal(pkg.patient.photoUrl, undefined);
    assert.equal(pkg.contacts.length, 0);
  });

  it("turns memory docs into offline-package memories, keeping family details", () => {
    const pkg = buildOfflinePackageFromFirestore(
      "pat-3",
      { displayName: "Aita", stateId: "AS" },
      [
        {
          id: "m1",
          category: "MY_FAMILY",
          personName: "Nabanita",
          relationship: "Daughter",
          title: "Evening tea",
          story: "Red tea in the garden every evening.",
          favourite: true,
        },
        { id: "m2", category: "HAPPY_MOMENTS", title: "Bihu", story: "Dancing at Bihu." },
      ],
      now,
    );

    assert.equal(pkg.memories.length, 2);
    const family = pkg.memories.find((m) => (m as { memoryId: string }).memoryId === "m1") as Record<string, unknown>;
    assert.equal(family.personName, "Nabanita");
    assert.equal(family.relationshipEn, "Daughter");
    assert.equal(family.assetType, "PHOTO");
    assert.equal(family.favourite, true);
    const moment = pkg.memories.find((m) => (m as { memoryId: string }).memoryId === "m2") as Record<string, unknown>;
    assert.equal(moment.assetType, "STORY");
    assert.equal(moment.storyEn, "Dancing at Bihu.");
  });
});
