import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALERT_DISCLAIMER,
  ALERT_SEVERITY_LABEL,
  alertCounts,
  cleanHealthCheck,
  concernHints,
  emptyHealthCheckDraft,
  healthCheckHasContent,
  parseVital,
  sortAlerts,
  summariseHealthCheck,
  visibleAlerts,
  type CareAlertDoc,
  type HealthCheckDraft,
} from "../healthModel";

const BANNED = ["diagnos", "dementia", "medicine", "medication", "dose", "prescri", "disease"];

function draft(over: Partial<HealthCheckDraft> = {}): HealthCheckDraft {
  return { ...emptyHealthCheckDraft(), ...over };
}

describe("parseVital", () => {
  it("reads numbers and rejects junk", () => {
    assert.equal(parseVital("128"), 128);
    assert.equal(parseVital("36.6"), 36.6);
    assert.equal(parseVital(" 96 % "), 96);
    assert.equal(parseVital(""), undefined);
    assert.equal(parseVital("abc"), undefined);
  });
});

describe("cleanHealthCheck", () => {
  it("keeps in-range vitals, rounds, trims text, drops the rest", () => {
    const c = cleanHealthCheck(
      draft({ systolic: 128.7, diastolic: 84, pulse: 76, spo2: 3, temperatureC: 36.62, mood: "  calm ", notes: " ok ", concern: true }),
    );
    assert.equal(c.systolic, 129);
    assert.equal(c.diastolic, 84);
    assert.equal(c.pulse, 76);
    assert.equal(c.temperatureC, 36.6);
    assert.equal("spo2" in c, false); // 3 is below the plausible floor
    assert.equal(c.mood, "calm");
    assert.equal(c.notes, "ok");
    assert.equal(c.concern, true);
  });

  it("omits absent keys entirely (Firestore rejects undefined)", () => {
    const c = cleanHealthCheck(draft({ pulse: 70 }));
    assert.deepEqual(Object.keys(c).sort(), ["concern", "mood", "notes", "pulse"]);
  });
});

describe("healthCheckHasContent", () => {
  it("is false for an empty draft and true once anything is filled", () => {
    assert.equal(healthCheckHasContent(draft()), false);
    assert.equal(healthCheckHasContent(draft({ notes: "walked outside" })), true);
    assert.equal(healthCheckHasContent(draft({ pulse: 72 })), true);
    assert.equal(healthCheckHasContent(draft({ pulse: 5 })), false); // implausible -> dropped
  });
});

describe("summariseHealthCheck", () => {
  it("formats a factual one-liner and marks a flagged check", () => {
    assert.equal(
      summariseHealthCheck(draft({ systolic: 128, diastolic: 84, pulse: 76, spo2: 96 })),
      "BP 128/84 · Pulse 76 · SpO₂ 96%",
    );
    assert.match(summariseHealthCheck(draft({ pulse: 80, concern: true })), /^Flagged for attention · /);
    assert.equal(summariseHealthCheck(draft({ notes: "resting comfortably" })), "resting comfortably");
  });
});

describe("concernHints", () => {
  it("prompts on unusual readings and stays quiet on normal ones", () => {
    assert.deepEqual(concernHints(draft({ systolic: 122, diastolic: 78, pulse: 72, spo2: 97, temperatureC: 36.7 })), []);
    assert.ok(concernHints(draft({ spo2: 88 })).length === 1);
    assert.ok(concernHints(draft({ temperatureC: 38.5 })).length === 1);
    // one BP hint even though both numbers are out of range
    assert.equal(concernHints(draft({ systolic: 170, diastolic: 105 })).length, 1);
  });

  it("never uses clinical / diagnostic language", () => {
    // The disclaimer deliberately says "not a diagnosis"; the guard is for
    // generated prompt text and the severity labels.
    const all = [
      ...concernHints(draft({ spo2: 85, temperatureC: 39, systolic: 180, diastolic: 110, pulse: 130, sleepHours: 2 })),
      ...Object.values(ALERT_SEVERITY_LABEL),
    ]
      .join(" ")
      .toLowerCase();
    for (const word of BANNED) assert.ok(!all.includes(word), `text contains "${word}"`);
    assert.ok(ALERT_DISCLAIMER.toLowerCase().includes("not a diagnosis"));
  });
});

describe("sortAlerts", () => {
  const base = (o: Partial<CareAlertDoc>): CareAlertDoc => ({
    id: Math.random().toString(36),
    patientId: "p1",
    patientName: "Aita",
    severity: "info",
    message: "note",
    audience: "caregiver",
    kind: "note",
    status: "open",
    raisedByUid: "w1",
    raisedByName: "Ananya",
    raisedByRole: "healthcare_worker",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...o,
  });

  it("orders open before resolved, then by severity, then newest first", () => {
    const list = [
      base({ status: "resolved", severity: "urgent", createdAt: "2026-08-05T00:00:00Z" }),
      base({ status: "open", severity: "info", createdAt: "2026-08-02T00:00:00Z" }),
      base({ status: "open", severity: "urgent", createdAt: "2026-08-01T00:00:00Z" }),
      base({ status: "open", severity: "urgent", createdAt: "2026-08-03T00:00:00Z" }),
    ];
    const out = sortAlerts(list);
    assert.equal(out[0].severity, "urgent");
    assert.equal(out[0].createdAt, "2026-08-03T00:00:00Z");
    assert.equal(out[1].severity, "urgent");
    assert.equal(out[2].severity, "info");
    assert.equal(out[3].status, "resolved");
  });
});

describe("visibleAlerts", () => {
  const mk = (o: Partial<CareAlertDoc>): CareAlertDoc => ({
    id: o.id ?? Math.random().toString(36),
    patientId: o.patientId ?? "p1",
    patientName: "Aita",
    severity: "info",
    message: "m",
    audience: o.audience ?? "caregiver",
    kind: "note",
    status: "open",
    raisedByUid: o.raisedByUid ?? "someone",
    raisedByName: "X",
    raisedByRole: o.raisedByRole ?? "healthcare_worker",
    createdAt: "2026-08-01T00:00:00Z",
    ...o,
  });

  it("shows a caregiver alerts for their patients addressed to caregiver or the team, plus their own", () => {
    const alerts = [
      mk({ id: "a", audience: "caregiver", patientId: "p1" }),
      mk({ id: "b", audience: "healthcare_worker", patientId: "p1" }),
      mk({ id: "c", audience: "care_team", patientId: "p1" }),
      mk({ id: "d", audience: "caregiver", patientId: "pX" }), // not their patient
      mk({ id: "e", audience: "healthcare_worker", patientId: "p1", raisedByUid: "cg1" }), // raised by me
    ];
    const seen = visibleAlerts(alerts, { role: "caregiver", uid: "cg1", patientIds: ["p1", "p2"] }).map((a) => a.id);
    assert.deepEqual(seen.sort(), ["a", "c", "e"]);
  });

  it("shows a worker alerts addressed to the worker or team", () => {
    const alerts = [
      mk({ id: "a", audience: "caregiver", patientId: "p1" }),
      mk({ id: "b", audience: "healthcare_worker", patientId: "p1" }),
      mk({ id: "c", audience: "care_team", patientId: "p1" }),
    ];
    const seen = visibleAlerts(alerts, { role: "healthcare_worker", uid: "w1", patientIds: ["p1"] }).map((a) => a.id);
    assert.deepEqual(seen.sort(), ["b", "c"]);
  });
});

describe("alertCounts", () => {
  it("counts unresolved and urgent-unresolved", () => {
    const mk = (severity: CareAlertDoc["severity"], status: CareAlertDoc["status"]): CareAlertDoc => ({
      id: Math.random().toString(36),
      patientId: "p",
      patientName: "n",
      severity,
      message: "m",
      audience: "caregiver",
      kind: "note",
      status,
      raisedByUid: "u",
      raisedByName: "n",
      raisedByRole: "healthcare_worker",
      createdAt: "2026-08-01T00:00:00Z",
    });
    const c = alertCounts([mk("urgent", "open"), mk("info", "acknowledged"), mk("urgent", "resolved")]);
    assert.deepEqual(c, { open: 2, urgent: 1 });
  });
});
