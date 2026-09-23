import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLocalDemoPackage } from "../localDemoPackage";

describe("local demo package", () => {
  it("gives Aita enough family for Who Is This and a day's schedule", () => {
    const pack = buildLocalDemoPackage();
    assert.equal(pack.patient.preferredName, "Aita");
    assert.ok(pack.memories.filter((m) => m.personName).length >= 2);
    assert.ok(pack.schedules.length >= 3);
    assert.equal(pack.gameConfig.games.length, 4);
  });
});
