import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NEStateIds } from "@smritisetu/shared-types";
import { ILLUSTRATION_IDS } from "../../games/illustrationCatalog";
import {
  CONTENT_PACKS,
  CONTENT_PACK_LIST,
  DEFAULT_CONTENT_PACK,
  resolveContentPack,
} from "../index";
import { CARD_COUNT_BY_DIFFICULTY, selectMatchObjects } from "../../games/gameContent";

const KNOWN_ILLUSTRATIONS = new Set<string>(ILLUSTRATION_IDS);
const MAX_PAIRS = Math.max(...Object.values(CARD_COUNT_BY_DIFFICULTY)) / 2;

describe("regional content packs", () => {
  it("has a pack for every North Eastern state", () => {
    for (const stateId of NEStateIds) {
      assert.ok(CONTENT_PACKS[stateId], `missing pack for ${stateId}`);
      assert.equal(CONTENT_PACKS[stateId].stateId, stateId);
    }
    assert.equal(CONTENT_PACK_LIST.length, NEStateIds.length);
  });

  it("falls back to the Assam pack for an unknown or missing state", () => {
    assert.equal(resolveContentPack(undefined).stateId, "AS");
    assert.equal(resolveContentPack(null).stateId, DEFAULT_CONTENT_PACK.stateId);
  });

  for (const pack of CONTENT_PACK_LIST) {
    describe(pack.stateName, () => {
      it("declares at least one language and one community", () => {
        assert.ok(pack.languages.length > 0);
        assert.ok(pack.communities.length > 0);
      });

      it("has enough match objects to fill the largest board", () => {
        assert.ok(
          pack.matchObjects.length >= MAX_PAIRS * 2,
          `${pack.stateName} needs at least ${MAX_PAIRS * 2} match objects`,
        );
      });

      it("has unique object ids", () => {
        const ids = pack.matchObjects.map((o) => o.id);
        assert.equal(new Set(ids).size, ids.length);
      });

      it("labels every object and place in English and the local language", () => {
        for (const object of pack.matchObjects) {
          assert.ok(object.labelEn.length > 0, `${object.id} needs an English label`);
          assert.ok(object.labelLocal.length > 0, `${object.id} needs a local label`);
          assert.ok(object.place.labelEn.length > 0, `${object.id} place needs an English label`);
          assert.ok(object.place.labelLocal.length > 0, `${object.id} place needs a local label`);
        }
      });

      it("only references illustrations that exist in the catalog", () => {
        for (const object of pack.matchObjects) {
          assert.ok(
            KNOWN_ILLUSTRATIONS.has(object.illustrationId),
            `unknown illustration "${object.illustrationId}" for ${pack.stateName}/${object.id}`,
          );
          assert.ok(
            KNOWN_ILLUSTRATIONS.has(object.place.illustrationId),
            `unknown place illustration "${object.place.illustrationId}" for ${pack.stateName}/${object.id}`,
          );
        }
        for (const id of pack.illustrationIds) {
          assert.ok(KNOWN_ILLUSTRATIONS.has(id), `pack ${pack.stateName} declares unknown illustration "${id}"`);
        }
      });

      it("can build a hardest-level board from look-alike groups", () => {
        const grouped = pack.matchObjects.filter((o) => o.similarGroup);
        assert.ok(
          grouped.length >= MAX_PAIRS,
          `${pack.stateName} needs >= ${MAX_PAIRS} objects with a similarGroup for level 4`,
        );
        const level4 = selectMatchObjects(4, () => 0.42, pack);
        assert.equal(level4.length, MAX_PAIRS);
        assert.ok(level4.every((o) => o.similarGroup), "level 4 must draw from look-alike groups");
      });

      it("gives every reference list real entries", () => {
        for (const key of ["places", "festivals", "foods", "music", "patterns"] as const) {
          assert.ok(pack[key].length >= 3, `${pack.stateName}.${key} needs at least 3 entries`);
          for (const entry of pack[key]) {
            assert.ok(entry.labelEn.length > 0, `${pack.stateName}.${key} entry needs an English label`);
            assert.ok(entry.labelLocal.length > 0, `${pack.stateName}.${key} entry needs a local label`);
          }
        }
      });
    });
  }
});
