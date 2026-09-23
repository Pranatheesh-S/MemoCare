import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Schedule } from "@smritisetu/shared-types";
import type { CachedMemory } from "../../db/repositories/memoryRepository";
import {
  CARD_COUNT_BY_DIFFICULTY,
  CHOICE_COUNT_BY_DIFFICULTY,
  HINTS_BY_DIFFICULTY,
  MATCH_OBJECTS,
  PREVIEW_SECONDS_BY_DIFFICULTY,
  ROUTINE_LENGTH_BY_DIFFICULTY,
  buildBoard,
  selectMatchObjects,
  selectRoutineSteps,
  selectRoutineStepsFromSchedules,
} from "../gameContent";
import * as match from "../logic/memoryMatch";
import * as routine from "../logic/routineBuilder";
import * as who from "../logic/whoIsThis";
import * as lane from "../logic/memoryLane";
import { composeGuidedPrompt } from "../memoryLanePrompt";

/** Deterministic "random" so board layouts are reproducible in tests. */
function seeded(seed = 1): () => number {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

describe("difficulty configuration", () => {
  it("uses 4, 6 and 8 cards for levels 1 to 3", () => {
    assert.equal(CARD_COUNT_BY_DIFFICULTY[1], 4);
    assert.equal(CARD_COUNT_BY_DIFFICULTY[2], 6);
    assert.equal(CARD_COUNT_BY_DIFFICULTY[3], 8);
  });

  it("keeps 8 cards at level 4 but makes them look alike", () => {
    assert.equal(CARD_COUNT_BY_DIFFICULTY[4], 8);
    const objects = selectMatchObjects(4, seeded(7));
    assert.equal(objects.length, 4);
    assert.ok(
      objects.every((o) => o.similarGroup),
      "level 4 must draw from look-alike groups",
    );
  });

  it("previews longest at the gentlest level and never drops to zero", () => {
    assert.ok(PREVIEW_SECONDS_BY_DIFFICULTY[1] > PREVIEW_SECONDS_BY_DIFFICULTY[4]);
    for (const level of [1, 2, 3, 4]) {
      assert.ok(PREVIEW_SECONDS_BY_DIFFICULTY[level] > 0, `level ${level} must still preview`);
    }
  });

  it("offers fewer hints as the level rises, but never none", () => {
    assert.ok(HINTS_BY_DIFFICULTY[1] >= HINTS_BY_DIFFICULTY[4]);
    assert.ok(HINTS_BY_DIFFICULTY[4] >= 1, "a hint must always be available");
  });

  it("grows the routine from 3 to 6 cards", () => {
    assert.equal(ROUTINE_LENGTH_BY_DIFFICULTY[1], 3);
    assert.equal(ROUTINE_LENGTH_BY_DIFFICULTY[4], 6);
    assert.equal(selectRoutineSteps(1).length, 3);
    assert.equal(selectRoutineSteps(4).length, 6);
  });

  it("grows the answer choices from 2 to 4", () => {
    assert.equal(CHOICE_COUNT_BY_DIFFICULTY[1], 2);
    assert.equal(CHOICE_COUNT_BY_DIFFICULTY[4], 4);
  });

  it("uses culturally familiar objects (default Assam pack)", () => {
    const ids = MATCH_OBJECTS.map((o) => o.id);
    for (const expected of ["tea", "basket", "gamosa", "pitha", "kopou", "dhol", "pot"]) {
      assert.ok(ids.includes(expected), `expected a ${expected} card`);
    }
  });

  it("gives every object a label in English and the local language", () => {
    for (const object of MATCH_OBJECTS) {
      assert.ok(object.labelEn.length > 0, `${object.id} needs an English label`);
      assert.ok(object.labelLocal.length > 0, `${object.id} needs a local label`);
    }
  });
});

describe("Memory Match", () => {
  function game(difficulty = 2, hints = 3) {
    return match.createGame(difficulty, hints, seeded(42), () => 1_000_000);
  }

  it("builds one pair per object", () => {
    const objects = selectMatchObjects(2, seeded(3));
    const board = buildBoard(objects, seeded(3));
    assert.equal(board.length, objects.length * 2);
    for (const object of objects) {
      assert.equal(board.filter((c) => c.objectId === object.id).length, 2);
    }
  });

  it("pairs each object with an identical copy of itself", () => {
    for (const object of MATCH_OBJECTS) {
      assert.ok(object.place.labelEn.length > 0, `${object.id} needs an English place`);
      assert.ok(object.place.labelLocal.length > 0, `${object.id} needs a local place`);
    }
    const objects = selectMatchObjects(2, seeded(3));
    const board = buildBoard(objects, seeded(3));
    for (const object of objects) {
      const pair = board.filter((c) => c.objectId === object.id);
      const kinds = pair.map((c) => c.kind).sort();
      assert.deepEqual(kinds, ["object", "object"]);
    }
  });

  it("starts with every card face up for the preview", () => {
    const state = game();
    assert.equal(state.previewing, true);
    assert.ok(Object.values(state.states).every((s) => s === "FACE_UP"));
  });

  it("turns everything face down when the preview ends", () => {
    const state = match.endPreview(game());
    assert.equal(state.previewing, false);
    assert.ok(Object.values(state.states).every((s) => s === "FACE_DOWN"));
  });

  it("ignores taps during the preview rather than counting them", () => {
    const state = game();
    const result = match.flipCard(state, state.cards[0].cardId);
    assert.equal(result.outcome, "IGNORED");
    assert.equal(result.state.attempts, 0);
  });

  it("counts one attempt per pair of cards turned over", () => {
    let state = match.endPreview(game());
    const first = state.cards[0];
    const mismatch = state.cards.find((c) => c.objectId !== first.objectId)!;

    state = match.flipCard(state, first.cardId).state;
    assert.equal(state.attempts, 0, "one card alone is not an attempt");

    const result = match.flipCard(state, mismatch.cardId);
    assert.equal(result.outcome, "NO_MATCH");
    assert.equal(result.state.attempts, 1);
  });

  it("recognises and keeps a matching pair", () => {
    let state = match.endPreview(game());
    const first = state.cards[0];
    const partner = state.cards.find((c) => c.objectId === first.objectId && c.cardId !== first.cardId)!;

    state = match.flipCard(state, first.cardId).state;
    const result = match.flipCard(state, partner.cardId);

    assert.equal(result.outcome, "MATCH");
    assert.equal(result.state.matchedPairs, 1);
    assert.equal(result.state.states[first.cardId], "MATCHED");
    assert.equal(result.state.states[partner.cardId], "MATCHED");
  });

  it("turns a mismatched pair back over", () => {
    let state = match.endPreview(game());
    const first = state.cards[0];
    const other = state.cards.find((c) => c.objectId !== first.objectId)!;
    state = match.flipCard(state, first.cardId).state;
    state = match.flipCard(state, other.cardId).state;

    const resolved = match.resolveMismatch(state);
    assert.equal(resolved.states[first.cardId], "FACE_DOWN");
    assert.equal(resolved.states[other.cardId], "FACE_DOWN");
    assert.equal(resolved.flipped.length, 0);
  });

  it("ignores a second tap on the same card", () => {
    let state = match.endPreview(game());
    const card = state.cards[0];
    state = match.flipCard(state, card.cardId).state;
    const repeat = match.flipCard(state, card.cardId);
    assert.equal(repeat.outcome, "IGNORED");
  });

  it("ignores taps on an already matched card", () => {
    let state = match.endPreview(game());
    const first = state.cards[0];
    const partner = state.cards.find((c) => c.objectId === first.objectId && c.cardId !== first.cardId)!;
    state = match.flipCard(state, first.cardId).state;
    state = match.flipCard(state, partner.cardId).state;
    assert.equal(match.flipCard(state, first.cardId).outcome, "IGNORED");
  });

  it("reports completion when the last pair is found", () => {
    let state = match.endPreview(match.createGame(1, 3, seeded(11), () => 0));
    let outcome = "";
    for (const object of new Set(state.cards.map((c) => c.objectId))) {
      const [a, b] = state.cards.filter((c) => c.objectId === object);
      state = match.flipCard(state, a.cardId).state;
      const result = match.flipCard(state, b.cardId);
      state = result.state;
      outcome = result.outcome;
    }
    assert.equal(outcome, "COMPLETED");
    assert.equal(state.completed, true);
    assert.equal(state.matchedPairs, state.totalPairs);
  });

  it("reveals a real pair when a hint is used", () => {
    const state = match.endPreview(game());
    const { state: hinted, revealed } = match.useHint(state);

    assert.equal(revealed.length, 2);
    const [a, b] = revealed.map((id) => hinted.cards.find((c) => c.cardId === id)!);
    assert.equal(a.objectId, b.objectId, "a hint must reveal a genuine pair");
    assert.equal(hinted.hintsUsed, 1);
    assert.equal(hinted.hintsRemaining, 2);
  });

  it("does not count a hint as an attempt", () => {
    const state = match.endPreview(game());
    const { state: hinted } = match.useHint(state);
    assert.equal(hinted.attempts, 0, "a hint must never look like a wrong answer");
  });

  it("stops offering hints once they run out", () => {
    let state = match.endPreview(match.createGame(2, 1, seeded(5), () => 0));
    state = match.useHint(state).state;
    const { state: after, revealed } = match.useHint(state);
    assert.deepEqual(revealed, []);
    assert.equal(after.hintsUsed, 1);
  });

  it("hides a hint again without disturbing matched cards", () => {
    let state = match.endPreview(game());
    const first = state.cards[0];
    const partner = state.cards.find((c) => c.objectId === first.objectId && c.cardId !== first.cardId)!;
    state = match.flipCard(state, first.cardId).state;
    state = match.flipCard(state, partner.cardId).state;

    const { state: hinted, revealed } = match.useHint(state);
    const hidden = match.hideHint(hinted, revealed);
    assert.equal(hidden.states[first.cardId], "MATCHED");
    for (const id of revealed) assert.equal(hidden.states[id], "FACE_DOWN");
  });

  it("scores accuracy as matches over attempts", () => {
    let state = match.endPreview(match.createGame(1, 3, seeded(9), () => 0));
    const objects = [...new Set(state.cards.map((c) => c.objectId))];

    // One miss, then both pairs found: 2 matches in 3 attempts.
    const [firstA] = state.cards.filter((c) => c.objectId === objects[0]);
    const [otherA] = state.cards.filter((c) => c.objectId === objects[1]);
    state = match.flipCard(state, firstA.cardId).state;
    state = match.resolveMismatch(match.flipCard(state, otherA.cardId).state);

    for (const object of objects) {
      const [a, b] = state.cards.filter((c) => c.objectId === object);
      state = match.flipCard(state, a.cardId).state;
      state = match.flipCard(state, b.cardId).state;
    }

    assert.equal(state.attempts, 3);
    assert.equal(state.matchedPairs, 2);
    assert.equal(match.computeAccuracy(state), 0.667);
  });

  it("reports null accuracy when nothing was attempted", () => {
    const state = match.endPreview(game());
    assert.equal(
      match.computeAccuracy(state),
      null,
      "no attempts must never be recorded as zero accuracy",
    );
  });

  it("never reports accuracy above 1", () => {
    let state = match.endPreview(match.createGame(1, 3, seeded(4), () => 0));
    for (const object of new Set(state.cards.map((c) => c.objectId))) {
      const [a, b] = state.cards.filter((c) => c.objectId === object);
      state = match.flipCard(state, a.cardId).state;
      state = match.flipCard(state, b.cardId).state;
    }
    assert.equal(match.computeAccuracy(state), 1);
  });

  it("measures engagement and average response time", () => {
    const state = match.createGame(2, 3, seeded(1), () => 1000);
    assert.equal(match.elapsedSeconds(state, () => 1000 + 60_000), 60);
    assert.equal(match.averageResponseSeconds(state, () => 1000 + 60_000), 60);
  });
});

describe("Routine Builder", () => {
  function game(difficulty = 2, hints = 3) {
    return routine.createGame(difficulty, hints, seeded(21), () => 0);
  }

  it("starts in an order that is not already correct", () => {
    const state = game();
    assert.notDeepEqual(state.order, state.correctOrder);
  });

  it("shows the right number of cards for the level", () => {
    assert.equal(routine.createGame(1, 3, seeded(2), () => 0).order.length, 3);
    assert.equal(routine.createGame(4, 3, seeded(2), () => 0).order.length, 6);
  });

  it("picks a card up with one tap and puts it down with another", () => {
    let state = game();
    const [first] = state.order;
    state = routine.selectCard(state, first);
    assert.equal(state.selectedId, first);
    state = routine.selectCard(state, first);
    assert.equal(state.selectedId, null, "tapping the same card again puts it back");
  });

  it("swaps two cards with a second tap, no dragging required", () => {
    let state = game();
    const [first, second] = state.order;
    state = routine.selectCard(state, first);
    state = routine.selectCard(state, second);

    assert.equal(state.order[0], second);
    assert.equal(state.order[1], first);
    assert.equal(state.moves, 1);
    assert.equal(state.selectedId, null);
  });

  it("moves a card with the up and down controls", () => {
    let state = game();
    const target = state.order[1];
    state = routine.moveCard(state, target, "UP");
    assert.equal(state.order[0], target);
    assert.equal(state.moves, 1);
  });

  it("ignores a move off either end", () => {
    let state = game();
    const before = [...state.order];
    state = routine.moveCard(state, state.order[0], "UP");
    assert.deepEqual(state.order, before);
    assert.equal(state.moves, 0, "an impossible move is not counted against the patient");

    state = routine.moveCard(state, state.order[state.order.length - 1], "DOWN");
    assert.deepEqual(state.order, before);
  });

  it("places one card correctly when a hint is used", () => {
    const state = game();
    const { state: hinted, placedStepId, position } = routine.useHint(state);

    assert.ok(placedStepId);
    assert.equal(hinted.order[position], hinted.correctOrder[position]);
    assert.equal(hinted.hintsUsed, 1);
    assert.ok(hinted.lockedPositions.includes(position));
  });

  it("does not count a hint as a move", () => {
    const { state: hinted } = routine.useHint(game());
    assert.equal(hinted.moves, 0);
  });

  it("locks a hinted position so it cannot be disturbed", () => {
    const { state: hinted, position } = routine.useHint(game());
    const lockedStep = hinted.order[position];
    const moved = routine.moveCard(hinted, lockedStep, "DOWN");
    assert.equal(moved.order[position], lockedStep, "a hinted card stays where the hint put it");
  });

  it("counts correct positions and recognises completion", () => {
    let state = game();
    state = { ...state, order: [...state.correctOrder] };
    const result = routine.check(state);

    assert.equal(result.isComplete, true);
    assert.equal(result.correctPositions, result.totalPositions);
    assert.equal(result.state.completed, true);
  });

  it("reports partial progress encouragingly rather than as a failure", () => {
    let state = game();
    const order = [...state.correctOrder];
    [order[0], order[1]] = [order[1], order[0]];
    state = { ...state, order };

    const result = routine.check(state);
    assert.equal(result.isComplete, false);
    assert.equal(result.correctPositions, result.totalPositions - 2);
  });

  it("excludes hinted positions from accuracy", () => {
    const state = game();
    const { state: hinted } = routine.useHint(state);
    const solved = { ...hinted, order: [...hinted.correctOrder] };

    // Every unlocked position is right, so accuracy is 1 even though a hint
    // was used — a hint neither inflates nor deflates the score.
    assert.equal(routine.computeAccuracy(solved), 1);
  });

  it("returns null accuracy when every position was hinted", () => {
    let state = routine.createGame(1, 5, seeded(2), () => 0);
    for (let i = 0; i < state.correctOrder.length; i++) {
      state = routine.useHint(state).state;
    }
    assert.equal(
      routine.computeAccuracy(state),
      null,
      "a fully hinted arrangement is not the patient's own work",
    );
  });

  it("locks both positions a hint's swap puts right", () => {
    // A hint swaps two cards. Whatever the swap lands correctly was placed by
    // the hint, not by the patient, and is locked accordingly.
    let state = routine.createGame(1, 5, seeded(2), () => 0);
    const { state: hinted, position } = routine.useHint(state);
    assert.ok(hinted.lockedPositions.includes(position));
    assert.ok(
      hinted.lockedPositions.length >= 2,
      "the destination of the swap is locked as well when it lands correctly",
    );
  });

  it("keeps positions the patient placed themselves out of the lock", () => {
    let state = routine.createGame(4, 5, seeded(2), () => 0);
    state = { ...state, order: [...state.correctOrder] };
    // Everything is already right, so a hint has nothing to place and changes
    // nothing — the patient keeps full credit.
    const { state: after, placedStepId } = routine.useHint(state);
    assert.equal(placedStepId, null);
    assert.equal(after.lockedPositions.length, 0);
    assert.equal(routine.computeAccuracy(after), 1);
  });

  it("marks which positions are correct so the screen can show progress", () => {
    const state = game();
    const flags = routine.correctPositionFlags({ ...state, order: [...state.correctOrder] });
    assert.ok(flags.every(Boolean));
  });
});

describe("Routine Builder from real schedules", () => {
  const DAY = new Date(2026, 7, 26); // a fixed Wednesday-or-whatever; only its weekday matters here
  const TODAY = DAY.getDay();
  const NOT_TODAY = (TODAY + 1) % 7;

  function schedule(overrides: Partial<Schedule> = {}): Schedule {
    return {
      scheduleId: "sched-1",
      patientId: "patient-1",
      kind: "MEDICINE",
      titleKey: "myDay.kind.MEDICINE",
      titleEn: "Take medicine",
      critical: false,
      occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }],
      missedAfterMinutes: 45,
      snoozeMinutes: 10,
      version: 1,
      active: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  it("builds today's routine from real schedules, ordered by time", () => {
    const schedules = [
      schedule({ scheduleId: "s-lunch", kind: "MEAL", titleEn: "Lunch", occurrences: [{ timeOfDay: "12:30", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-medicine", kind: "MEDICINE", titleEn: "Morning tablet", occurrences: [{ timeOfDay: "08:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-walk", kind: "EXERCISE", titleEn: "Evening walk", occurrences: [{ timeOfDay: "17:00", daysOfWeek: [] }] }),
    ];

    const steps = selectRoutineStepsFromSchedules(schedules, 2, DAY);

    assert.ok(steps);
    assert.deepEqual(
      steps!.map((s) => s.id),
      ["s-medicine", "s-lunch", "s-walk"],
    );
    assert.equal(steps![0].labelEn, "Morning tablet");
    assert.equal(steps![0].illustrationId, "MedicineTablet");
  });

  it("falls back to the schedule's English title when there is no Assamese one", () => {
    const schedules = [
      schedule({ scheduleId: "a", titleEn: "Take medicine", titleAs: undefined, occurrences: [{ timeOfDay: "08:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "b", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "c", occurrences: [{ timeOfDay: "10:00", daysOfWeek: [] }] }),
    ];
    const steps = selectRoutineStepsFromSchedules(schedules, 2, DAY);
    assert.equal(steps![0].labelAs, "Take medicine");
  });

  it("collapses a schedule due several times today to its earliest occurrence", () => {
    const schedules = [
      schedule({
        scheduleId: "s-medicine",
        occurrences: [
          { timeOfDay: "20:00", daysOfWeek: [] },
          { timeOfDay: "08:00", daysOfWeek: [] },
          { timeOfDay: "14:00", daysOfWeek: [] },
        ],
      }),
      schedule({ scheduleId: "s-lunch", kind: "MEAL", occurrences: [{ timeOfDay: "12:30", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-walk", kind: "EXERCISE", occurrences: [{ timeOfDay: "17:00", daysOfWeek: [] }] }),
    ];

    const steps = selectRoutineStepsFromSchedules(schedules, 3, DAY);

    assert.equal(steps!.filter((s) => s.id === "s-medicine").length, 1);
    assert.deepEqual(
      steps!.map((s) => s.id),
      ["s-medicine", "s-lunch", "s-walk"],
    );
  });

  it("drops a schedule that collides on the exact same time, keeping the puzzle solvable", () => {
    const schedules = [
      schedule({ scheduleId: "s-a", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-b", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-c", kind: "MEAL", occurrences: [{ timeOfDay: "12:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-d", kind: "EXERCISE", occurrences: [{ timeOfDay: "17:00", daysOfWeek: [] }] }),
    ];

    const steps = selectRoutineStepsFromSchedules(schedules, 2, DAY);

    assert.equal(steps!.length, 3);
    // Exactly one of the two colliding schedules survives, never both.
    const survivedCollision = steps!.filter((s) => s.id === "s-a" || s.id === "s-b").length;
    assert.equal(survivedCollision, 1);
  });

  it("excludes a schedule not due on the given day", () => {
    const schedules = [
      schedule({ scheduleId: "s-a", occurrences: [{ timeOfDay: "08:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-b", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-c", occurrences: [{ timeOfDay: "10:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-not-today", occurrences: [{ timeOfDay: "11:00", daysOfWeek: [NOT_TODAY] }] }),
    ];

    const steps = selectRoutineStepsFromSchedules(schedules, 2, DAY);

    assert.ok(steps!.every((s) => s.id !== "s-not-today"));
  });

  it("ignores an inactive schedule", () => {
    const schedules = [
      schedule({ scheduleId: "s-a", occurrences: [{ timeOfDay: "08:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-b", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-c", occurrences: [{ timeOfDay: "10:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-paused", active: false, occurrences: [{ timeOfDay: "11:00", daysOfWeek: [] }] }),
    ];

    const steps = selectRoutineStepsFromSchedules(schedules, 2, DAY);

    assert.ok(steps!.every((s) => s.id !== "s-paused"));
  });

  it("falls back to null when fewer than three real schedules are due today", () => {
    const schedules = [
      schedule({ scheduleId: "s-a", occurrences: [{ timeOfDay: "08:00", daysOfWeek: [TODAY] }] }),
      schedule({ scheduleId: "s-b", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [NOT_TODAY] }] }),
    ];

    assert.equal(selectRoutineStepsFromSchedules(schedules, 2, DAY), null);
  });

  it("respects the difficulty length cap", () => {
    const schedules = Array.from({ length: 6 }, (_, i) =>
      schedule({ scheduleId: `s-${i}`, occurrences: [{ timeOfDay: `0${i}:00`, daysOfWeek: [] }] }),
    );

    assert.equal(selectRoutineStepsFromSchedules(schedules, 1, DAY)!.length, ROUTINE_LENGTH_BY_DIFFICULTY[1]);
    assert.equal(selectRoutineStepsFromSchedules(schedules, 4, DAY)!.length, ROUTINE_LENGTH_BY_DIFFICULTY[4]);
  });

  it("feeds straight into createGame so the puzzle is playable", () => {
    const schedules = [
      schedule({ scheduleId: "s-a", occurrences: [{ timeOfDay: "08:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-b", occurrences: [{ timeOfDay: "09:00", daysOfWeek: [] }] }),
      schedule({ scheduleId: "s-c", occurrences: [{ timeOfDay: "10:00", daysOfWeek: [] }] }),
    ];
    const steps = selectRoutineStepsFromSchedules(schedules, 2, DAY);
    const state = routine.createGame(2, 3, seeded(5), () => 0, steps!);

    assert.deepEqual(state.correctOrder, ["s-a", "s-b", "s-c"]);
    assert.notDeepEqual(state.order, state.correctOrder);
  });
});

describe("Who Is This?", () => {
  function person(id: string, name: string): CachedMemory {
    return {
      memoryId: id,
      patientId: "p1",
      category: "MY_FAMILY",
      assetType: "PHOTO",
      titleEn: name,
      personName: name,
      relationshipEn: "Daughter",
      consentId: "c1",
      favourite: false,
      available: true,
      createdAt: new Date().toISOString(),
    };
  }

  const people = [
    person("m1", "Nabanita"),
    person("m2", "Bhaskar"),
    person("m3", "Rishav"),
    person("m4", "Rekha"),
  ];

  it("needs at least two people to make a question", () => {
    assert.equal(who.createGame([person("m1", "Only")], 2, 2, seeded(1), () => 0), null);
    assert.ok(who.createGame(people, 2, 2, seeded(1), () => 0));
  });

  it("offers the number of choices the level calls for", () => {
    const easy = who.createGame(people, 1, 2, seeded(3), () => 0)!;
    const hard = who.createGame(people, 4, 2, seeded(3), () => 0)!;
    assert.equal(easy.rounds[0].choices.length, 2);
    assert.equal(hard.rounds[0].choices.length, 4);
  });

  it("always includes exactly one correct choice", () => {
    const state = who.createGame(people, 3, 2, seeded(8), () => 0)!;
    for (const round of state.rounds) {
      assert.equal(round.choices.filter((c) => c.isCorrect).length, 1);
    }
  });

  it("excludes unavailable photographs", () => {
    const withMissing = [...people, { ...person("m5", "Missing"), available: false }];
    const state = who.createGame(withMissing, 4, 2, seeded(1), () => 0)!;
    assert.ok(state.rounds.every((r) => r.memory.memoryId !== "m5"));
  });

  it("reveals the person on a correct answer", () => {
    const state = who.createGame(people, 2, 2, seeded(6), () => 0)!;
    const correct = state.rounds[0].choices.find((c) => c.isCorrect)!;
    const result = who.answer(state, correct.id);

    assert.equal(result.isCorrect, true);
    assert.equal(result.outcome, "CORRECT");
    assert.equal(result.revealedName, state.rounds[0].memory.personName);
    assert.equal(result.state.correctFirstTry, 1);
  });

  it("invites another try rather than saying the answer was wrong", () => {
    const state = who.createGame(people, 3, 2, seeded(6), () => 0)!;
    const incorrect = state.rounds[0].choices.find((c) => !c.isCorrect)!;
    const result = who.answer(state, incorrect.id);

    assert.equal(result.outcome, "TRY_AGAIN");
    assert.equal(result.revealedName, undefined, "the round stays open after one try");
    assert.equal(result.state.rounds[0].revealed, false);
  });

  it("reveals the person warmly after a second try", () => {
    let state = who.createGame(people, 4, 2, seeded(6), () => 0)!;
    const incorrect = state.rounds[0].choices.filter((c) => !c.isCorrect);
    state = who.answer(state, incorrect[0].id).state;
    const second = who.answer(state, incorrect[1].id);

    assert.equal(second.state.rounds[0].revealed, true);
    assert.equal(second.revealedName, state.rounds[0].memory.personName);
  });

  it("ignores a repeated tap on the same choice", () => {
    let state = who.createGame(people, 3, 2, seeded(6), () => 0)!;
    const choice = state.rounds[0].choices.find((c) => !c.isCorrect)!;
    state = who.answer(state, choice.id).state;
    const repeat = who.answer(state, choice.id);
    assert.equal(repeat.outcome, "IGNORED");
    assert.equal(repeat.state.totalAttempts, 1);
  });

  it("removes an incorrect choice when a hint is used", () => {
    const state = who.createGame(people, 4, 2, seeded(6), () => 0)!;
    const before = state.rounds[0].choices.length;
    const { state: hinted, removedId } = who.useHint(state);

    assert.ok(removedId);
    assert.equal(hinted.rounds[0].choices.length, before - 1);
    assert.ok(hinted.rounds[0].choices.some((c) => c.isCorrect), "the answer is never removed");
    assert.equal(hinted.hintsUsed, 1);
  });

  it("never reduces the choices below two", () => {
    const state = who.createGame(people, 1, 3, seeded(6), () => 0)!;
    const { state: hinted, removedId } = who.useHint(state);
    assert.equal(removedId, null);
    assert.equal(hinted.rounds[0].choices.length, 2);
  });

  it("scores first-try recognitions over rounds actually reached", () => {
    let state = who.createGame(people, 2, 2, seeded(6), () => 0)!;
    // Round 1 right first time, round 2 wrong first time.
    state = who.answer(state, state.rounds[0].choices.find((c) => c.isCorrect)!.id).state;
    state = who.nextRound(state);
    state = who.answer(state, state.rounds[1].choices.find((c) => !c.isCorrect)!.id).state;

    assert.equal(who.computeAccuracy(state), 0.5);
  });

  it("reports null accuracy when no round was attempted", () => {
    const state = who.createGame(people, 2, 2, seeded(6), () => 0)!;
    assert.equal(who.computeAccuracy(state), null);
  });

  it("does not treat leaving early as a run of wrong answers", () => {
    let state = who.createGame(people, 2, 2, seeded(6), () => 0)!;
    state = who.answer(state, state.rounds[0].choices.find((c) => c.isCorrect)!.id).state;
    // Three rounds never reached; accuracy reflects only the one played.
    assert.equal(who.computeAccuracy(state), 1);
  });

  it("completes after the final round", () => {
    let state = who.createGame(people, 2, 2, seeded(6), () => 0)!;
    for (let i = 0; i < state.rounds.length; i++) state = who.nextRound(state);
    assert.equal(state.completed, true);
  });
});

describe("Memory Lane", () => {
  function asset(id: string, available = true): CachedMemory {
    return {
      memoryId: id,
      patientId: "p1",
      category: "MY_FESTIVALS",
      assetType: "PHOTO",
      titleEn: `Memory ${id}`,
      consentId: "c1",
      favourite: false,
      available,
      createdAt: new Date().toISOString(),
    };
  }

  it("skips assets that are not on the device", () => {
    const state = lane.createSession([asset("a"), asset("b", false), asset("c")]);
    assert.deepEqual(state.assets.map((a) => a.memoryId), ["a", "c"]);
  });

  it("moves forward and back without running off either end", () => {
    let state = lane.createSession([asset("a"), asset("b")]);
    assert.equal(lane.hasPrevious(state), false);

    state = lane.next(state);
    assert.equal(lane.currentAsset(state)?.memoryId, "b");
    assert.equal(lane.hasNext(state), false);

    state = lane.next(state);
    assert.equal(state.index, 1, "next at the end simply stays put");

    state = lane.previous(state);
    assert.equal(state.index, 0);
    state = lane.previous(state);
    assert.equal(state.index, 0, "previous at the start simply stays put");
  });

  it("records every asset the patient actually saw", () => {
    let state = lane.createSession([asset("a"), asset("b"), asset("c")]);
    state = lane.next(state);
    state = lane.next(state);
    state = lane.previous(state);
    assert.deepEqual([...state.viewedIds].sort(), ["a", "b", "c"]);
  });

  it("counts audio playback", () => {
    let state = lane.createSession([asset("a")]);
    state = lane.recordAudioPlayed(state);
    state = lane.recordAudioPlayed(state);
    assert.equal(state.audioPlayedCount, 2);
  });

  it("is never scored", () => {
    let state = lane.createSession([asset("a")]);
    state = lane.markVoluntaryCompletion(state);
    const metrics = lane.toSessionMetrics(state, () => state.startedAt + 120_000);

    assert.equal(metrics.accuracy, null, "Memory Lane must never carry an accuracy");
    assert.equal(metrics.attempts, 0);
    assert.equal(metrics.hintsUsed, 0);
    assert.equal(metrics.completed, true);
    assert.equal(metrics.abandoned, false, "leaving a calm activity is not abandonment");
    assert.equal(metrics.engagementDurationSeconds, 120);
    assert.equal(metrics.detail.voluntaryCompletion, true);
  });

  it("handles having no memories at all without crashing", () => {
    const state = lane.createSession([]);
    assert.equal(lane.currentAsset(state), null);
    assert.equal(lane.hasNext(state), false);
    assert.deepEqual(lane.next(state).viewedIds, []);
  });
});

describe("Memory Lane guided prompts", () => {
  it("composes a spoken prompt from stored labels", () => {
    const prompt = composeGuidedPrompt(
      {
        memoryId: "m1",
        patientId: "p1",
        category: "MY_FESTIVALS",
        assetType: "PHOTO",
        titleEn: "Bihu",
        personName: "Ramen",
        relationshipEn: "brother",
        captionEn: "at Bihu, in Majuli",
        consentId: "c1",
        favourite: false,
        available: true,
        createdAt: new Date().toISOString(),
      },
      "en",
    );

    assert.equal(prompt.key, "memoryLane.guidedPrompt");
    assert.equal(prompt.params.name, "Ramen");
    assert.equal(prompt.params.relationshipClause, ", your brother");
    assert.equal(prompt.params.sceneClause, ", at Bihu, in Majuli");
  });

  it("falls back to the title when there is no person name", () => {
    const prompt = composeGuidedPrompt(
      {
        memoryId: "m2",
        patientId: "p1",
        category: "MY_HOME",
        assetType: "PHOTO",
        titleEn: "Our courtyard",
        consentId: "c1",
        favourite: false,
        available: true,
        createdAt: new Date().toISOString(),
      },
      "en",
    );

    assert.equal(prompt.params.name, "Our courtyard");
    assert.equal(prompt.params.relationshipClause, "");
    assert.equal(prompt.params.sceneClause, "");
  });
});
