import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MIN_DAYS_FOR_AI_SUGGESTIONS,
  addDays,
  canSuggestRoutine,
  cleanRoutineItems,
  humanDate,
  isValidTime,
  medicineItems,
  normaliseTime,
  sampleRoutineDays,
  sortItems,
  summariseRoutineDays,
  todayISO,
  weekdayOf,
  type RoutineDay,
  type RoutineItem,
} from "../routineModel";

const item = (o: Partial<RoutineItem> = {}): RoutineItem => ({ time: "08:00", title: "Tea", kind: "meal", ...o });

describe("time helpers", () => {
  it("validates HH:MM", () => {
    assert.ok(isValidTime("07:30"));
    assert.ok(isValidTime("23:59"));
    assert.ok(!isValidTime("24:00"));
    assert.ok(!isValidTime("7:5"));
  });
  it("normalises loose times, leaves junk alone", () => {
    assert.equal(normaliseTime("9:5"), "09:05");
    assert.equal(normaliseTime("7:30"), "07:30");
    assert.equal(normaliseTime("later"), "later");
  });
});

describe("cleanRoutineItems", () => {
  it("drops blank titles, normalises time, omits empty optionals, sorts by time", () => {
    const out = cleanRoutineItems([
      item({ time: "9:0", title: "  Walk  ", kind: "exercise", note: "  " }),
      item({ time: "07:00", title: "Medicine", kind: "medicine", critical: true }),
      item({ time: "10:00", title: "   " }),
    ]);
    assert.equal(out.length, 2);
    assert.deepEqual(
      out.map((i) => i.time),
      ["07:00", "09:00"],
    );
    assert.equal(out[1].title, "Walk");
    assert.ok(!("note" in out[1]));
    assert.equal(out[0].critical, true);
  });

  it("falls back to 'other' for an unknown kind", () => {
    const [only] = cleanRoutineItems([item({ kind: "party" as RoutineItem["kind"] })]);
    assert.equal(only.kind, "other");
  });
});

describe("medicineItems", () => {
  it("returns only medicine rows, in time order", () => {
    const meds = medicineItems({
      items: [item({ time: "20:00", kind: "medicine", title: "Night" }), item({ kind: "meal" }), item({ time: "08:00", kind: "medicine", title: "Morning" })],
    });
    assert.deepEqual(
      meds.map((m) => m.title),
      ["Morning", "Night"],
    );
  });
});

describe("AI gate", () => {
  it("needs the minimum approved days", () => {
    assert.equal(canSuggestRoutine(MIN_DAYS_FOR_AI_SUGGESTIONS - 1), false);
    assert.equal(canSuggestRoutine(MIN_DAYS_FOR_AI_SUGGESTIONS), true);
  });
});

describe("date helpers", () => {
  it("adds days across month boundaries", () => {
    assert.equal(addDays("2026-01-31", 1), "2026-02-01");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  });
  it("humanises today / tomorrow / yesterday", () => {
    const t = "2026-09-10";
    assert.equal(humanDate("2026-09-10", t), "Today");
    assert.equal(humanDate("2026-09-11", t), "Tomorrow");
    assert.equal(humanDate("2026-09-09", t), "Yesterday");
    assert.match(humanDate("2026-09-15", t), /,/);
  });
  it("todayISO is YYYY-MM-DD", () => {
    assert.match(todayISO(new Date("2026-09-01T10:00:00")), /^\d{4}-\d{2}-\d{2}$/);
  });
  it("weekdayOf is stable", () => {
    assert.equal(weekdayOf("2026-09-01"), "Tuesday");
  });
});

describe("summariseRoutineDays", () => {
  it("includes only approved days and reads back the items", () => {
    const days: RoutineDay[] = [
      { date: "2026-09-01", approved: true, source: "caregiver", createdAt: "", items: [item({ time: "08:00", title: "Tea", kind: "meal" })] },
      { date: "2026-09-02", approved: false, source: "ai", createdAt: "", items: [item({ title: "Secret" })] },
    ];
    const text = summariseRoutineDays(days);
    assert.match(text, /2026-09-01/);
    assert.match(text, /Tea/);
    assert.doesNotMatch(text, /Secret/);
  });
});

describe("sampleRoutineDays", () => {
  const today = "2026-09-10";
  const days = sampleRoutineDays(today);

  it("is five approved caregiver days, dated yesterday back to -5", () => {
    assert.equal(days.length, 5);
    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-09-09", "2026-09-08", "2026-09-07", "2026-09-06", "2026-09-05"],
    );
    assert.ok(days.every((d) => d.approved && d.source === "caregiver"));
  });

  it("unlocks the AI draft (>= the minimum approved days)", () => {
    assert.equal(canSuggestRoutine(days.length), true);
  });

  it("has the same two medicines at the same times every day", () => {
    for (const d of days) {
      const meds = medicineItems(d).map((m) => `${m.time} ${m.title}`);
      assert.deepEqual(meds, ["08:00 Morning tablet", "20:00 Evening tablet"]);
      assert.ok(medicineItems(d).every((m) => m.critical));
    }
  });

  it("varies the activities day to day", () => {
    const tenThirty = days.map((d) => d.items.find((it) => it.time === "10:30")?.title);
    assert.equal(new Set(tenThirty).size, 5);
  });

  it("items are clean and time-ordered", () => {
    for (const d of days) {
      assert.deepEqual(d.items, sortItems(d.items));
      assert.ok(d.items.every((it) => isValidTime(it.time) && it.title.length > 0));
    }
  });
});

describe("sortItems", () => {
  it("does not mutate the input", () => {
    const input = [item({ time: "10:00" }), item({ time: "08:00" })];
    const sorted = sortItems(input);
    assert.equal(input[0].time, "10:00");
    assert.equal(sorted[0].time, "08:00");
  });
});
