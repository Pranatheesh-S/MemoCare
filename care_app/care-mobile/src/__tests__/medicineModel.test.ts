import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adherence,
  groupByDay,
  todaysDoses,
  type MedicineLogEntry,
} from "../medicineModel";
import type { RoutineItem } from "../routineModel";

const entry = (o: Partial<MedicineLogEntry> = {}): MedicineLogEntry => ({
  date: "2026-09-10",
  name: "Donepezil",
  status: "taken",
  loggedByRole: "caregiver",
  loggedAt: "2026-09-10T08:05:00Z",
  ...o,
});

describe("adherence", () => {
  it("is taken / (taken + missed); skipped is ignored", () => {
    const a = adherence([entry({ status: "taken" }), entry({ status: "missed" }), entry({ status: "taken" }), entry({ status: "skipped" })]);
    assert.equal(a.taken, 2);
    assert.equal(a.considered, 3);
    assert.equal(a.pct, 67);
  });
  it("is null with nothing to consider", () => {
    assert.equal(adherence([]).pct, null);
    assert.equal(adherence([entry({ status: "skipped" })]).pct, null);
  });
});

describe("groupByDay", () => {
  it("groups newest-first with per-day counts and time-ordered entries", () => {
    const days = groupByDay([
      entry({ date: "2026-09-09", time: "20:00", status: "missed" }),
      entry({ date: "2026-09-10", time: "20:00" }),
      entry({ date: "2026-09-10", time: "08:00" }),
    ]);
    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-09-10", "2026-09-09"],
    );
    assert.equal(days[0].taken, 2);
    assert.deepEqual(
      days[0].entries.map((e) => e.time),
      ["08:00", "20:00"],
    );
    assert.equal(days[1].missed, 1);
  });
});

describe("todaysDoses", () => {
  const med = (o: Partial<RoutineItem>): RoutineItem => ({ time: "08:00", title: "Donepezil", kind: "medicine", ...o });

  it("maps each scheduled medicine to its logged status, else pending", () => {
    const scheduled = [med({ time: "08:00", title: "Donepezil", critical: true }), med({ time: "20:00", title: "Memantine" }), { time: "09:00", title: "Walk", kind: "exercise" } as RoutineItem];
    const log = [entry({ time: "08:00", name: "donepezil", status: "taken" })];
    const doses = todaysDoses(scheduled, log);
    assert.equal(doses.length, 2); // the walk is not a medicine
    assert.equal(doses[0].status, "taken");
    assert.equal(doses[0].critical, true);
    assert.equal(doses[1].status, "pending");
  });

  it("orders doses by time", () => {
    const doses = todaysDoses([med({ time: "20:00", title: "B" }), med({ time: "08:00", title: "A" })], []);
    assert.deepEqual(
      doses.map((d) => d.name),
      ["A", "B"],
    );
  });
});
