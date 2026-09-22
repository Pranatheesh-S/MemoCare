/**
 * Pure shapes and helpers for the health-worker portal: periodic health checks
 * and the care-team alert feed. No Firebase here so this stays fully unit-tested
 * (the Firestore layer lives in health.ts).
 *
 * Nothing in this file diagnoses. Health checks are recorded observations;
 * "concern hints" are prompts to re-check a reading and tell the caregiver,
 * never a clinical judgement.
 */

export type CareRole = "caregiver" | "healthcare_worker";

/* -------------------------------------------------------------------------- */
/*  Health checks                                                             */
/* -------------------------------------------------------------------------- */

export type Vitals = {
  systolic?: number;
  diastolic?: number;
  pulse?: number;
  temperatureC?: number;
  spo2?: number;
  weightKg?: number;
  sleepHours?: number;
};

export type Appetite = "poor" | "fair" | "good";

export type HealthCheckDraft = Vitals & {
  appetite?: Appetite;
  mood: string;
  notes: string;
  concern: boolean;
};

export type HealthCheckDoc = HealthCheckDraft & {
  id: string;
  recordedByUid: string;
  recordedByName: string;
  recordedAt: string;
};

export type VitalKey = keyof Vitals;

/** Field metadata drives the form and the plausibility filter in one place. */
export const VITAL_FIELDS: readonly {
  key: VitalKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  decimals: number;
}[] = [
  { key: "systolic", label: "Blood pressure — systolic", unit: "mmHg", min: 60, max: 260, decimals: 0 },
  { key: "diastolic", label: "Blood pressure — diastolic", unit: "mmHg", min: 30, max: 160, decimals: 0 },
  { key: "pulse", label: "Pulse", unit: "bpm", min: 30, max: 220, decimals: 0 },
  { key: "temperatureC", label: "Temperature", unit: "°C", min: 33, max: 43, decimals: 1 },
  { key: "spo2", label: "Oxygen (SpO₂)", unit: "%", min: 50, max: 100, decimals: 0 },
  { key: "weightKg", label: "Weight", unit: "kg", min: 20, max: 250, decimals: 1 },
  { key: "sleepHours", label: "Sleep last night", unit: "h", min: 0, max: 16, decimals: 1 },
];

export const APPETITE_OPTIONS: readonly Appetite[] = ["poor", "fair", "good"];

export function emptyHealthCheckDraft(): HealthCheckDraft {
  return { mood: "", notes: "", concern: false };
}

/** "128" -> 128, "36.6" -> 36.6, "" / "abc" -> undefined. */
export function parseVital(text: string): number | undefined {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Strips blank / out-of-range vitals and trims text — safe to write to Firestore
 *  (which rejects `undefined`, so absent keys are omitted, not set to undefined). */
export function cleanHealthCheck(draft: HealthCheckDraft): HealthCheckDraft {
  const out: HealthCheckDraft = { mood: draft.mood.trim(), notes: draft.notes.trim(), concern: Boolean(draft.concern) };
  for (const f of VITAL_FIELDS) {
    const v = draft[f.key];
    if (typeof v === "number" && Number.isFinite(v) && v >= f.min && v <= f.max) {
      out[f.key] = f.decimals === 0 ? Math.round(v) : Math.round(v * 10) / 10;
    }
  }
  if (draft.appetite && APPETITE_OPTIONS.includes(draft.appetite)) out.appetite = draft.appetite;
  return out;
}

/** Is there anything worth saving? */
export function healthCheckHasContent(draft: HealthCheckDraft): boolean {
  const c = cleanHealthCheck(draft);
  return (
    VITAL_FIELDS.some((f) => typeof c[f.key] === "number") ||
    Boolean(c.appetite) ||
    c.mood.length > 0 ||
    c.notes.length > 0
  );
}

/** A short factual one-liner, e.g. "BP 128/84 · Pulse 76 · SpO₂ 96%". */
export function summariseHealthCheck(hc: HealthCheckDraft): string {
  const parts: string[] = [];
  if (typeof hc.systolic === "number" && typeof hc.diastolic === "number") {
    parts.push(`BP ${Math.round(hc.systolic)}/${Math.round(hc.diastolic)}`);
  }
  if (typeof hc.pulse === "number") parts.push(`Pulse ${Math.round(hc.pulse)}`);
  if (typeof hc.spo2 === "number") parts.push(`SpO₂ ${Math.round(hc.spo2)}%`);
  if (typeof hc.temperatureC === "number") parts.push(`Temp ${hc.temperatureC.toFixed(1)}°C`);
  if (typeof hc.weightKg === "number") parts.push(`Weight ${hc.weightKg.toFixed(1)} kg`);
  if (typeof hc.sleepHours === "number") parts.push(`Slept ${hc.sleepHours}h`);
  if (hc.appetite) parts.push(`Appetite ${hc.appetite}`);
  const line = parts.join(" · ");
  if (!line) return hc.notes.trim() || "Check recorded";
  return hc.concern ? `Flagged for attention · ${line}` : line;
}

/**
 * Gentle, non-clinical prompts when a reading looks unusual. These ask the
 * worker to re-check and tell the caregiver; they are not a diagnosis and never
 * mention conditions or treatment.
 */
export function concernHints(draft: HealthCheckDraft): string[] {
  const hints: string[] = [];
  const { systolic, diastolic, pulse, spo2, temperatureC, sleepHours } = draft;
  if (typeof spo2 === "number" && spo2 < 92) {
    hints.push("Oxygen reading is on the low side. Re-check after a short rest and let the caregiver know.");
  }
  if (typeof temperatureC === "number" && temperatureC >= 38) {
    hints.push("Temperature is raised. Keep an eye on it and tell the caregiver.");
  }
  if (typeof temperatureC === "number" && temperatureC <= 35) {
    hints.push("Temperature is low. Re-check and mention it to the caregiver.");
  }
  if (typeof systolic === "number" && (systolic >= 160 || systolic <= 90)) {
    hints.push("Blood pressure is outside the usual range. Re-check when the patient is settled and share it with the caregiver.");
  }
  if (typeof diastolic === "number" && (diastolic >= 100 || diastolic <= 55)) {
    hints.push("Blood pressure is outside the usual range. Re-check when the patient is settled and share it with the caregiver.");
  }
  if (typeof pulse === "number" && (pulse >= 110 || pulse <= 45)) {
    hints.push("Pulse is outside the usual range. Re-check after a rest and note it for the caregiver.");
  }
  if (typeof sleepHours === "number" && sleepHours <= 3) {
    hints.push("Very little sleep last night. Worth mentioning to the caregiver if it continues.");
  }
  // de-duplicate (BP hint can come from either number)
  return [...new Set(hints)];
}

/* -------------------------------------------------------------------------- */
/*  Care-team alerts                                                          */
/* -------------------------------------------------------------------------- */

export type AlertSeverity = "info" | "attention" | "urgent";
export type AlertAudience = "caregiver" | "healthcare_worker" | "care_team";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type AlertKind = "health_risk" | "note" | "system";

export type CareAlertDraft = {
  severity: AlertSeverity;
  message: string;
  audience: AlertAudience;
  kind?: AlertKind;
  healthCheckId?: string;
};

export type CareAlertDoc = {
  id: string;
  patientId: string;
  patientName: string;
  severity: AlertSeverity;
  message: string;
  audience: AlertAudience;
  kind: AlertKind;
  status: AlertStatus;
  raisedByUid: string;
  raisedByName: string;
  raisedByRole: CareRole;
  createdAt: string;
  healthCheckId?: string;
  acknowledgedByName?: string;
  acknowledgedAt?: string;
  resolvedByName?: string;
  resolvedAt?: string;
};

export const ALERT_SEVERITY_RANK: Record<AlertSeverity, number> = { urgent: 0, attention: 1, info: 2 };
export const ALERT_STATUS_RANK: Record<AlertStatus, number> = { open: 0, acknowledged: 1, resolved: 2 };

export const ALERT_SEVERITY_LABEL: Record<AlertSeverity, string> = {
  urgent: "Urgent",
  attention: "Needs attention",
  info: "For your information",
};

export const ALERT_DISCLAIMER =
  "Alerts support care coordination between the family and the health worker. They are not a diagnosis or an emergency service.";

/** Open first, then by severity, then newest first. */
export function sortAlerts(alerts: CareAlertDoc[]): CareAlertDoc[] {
  return [...alerts].sort((a, b) => {
    if (a.status !== b.status) return ALERT_STATUS_RANK[a.status] - ALERT_STATUS_RANK[b.status];
    if (a.severity !== b.severity) return ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity];
    return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
  });
}

function audienceReaches(audience: AlertAudience, role: CareRole): boolean {
  return audience === "care_team" || audience === role;
}

/**
 * What a given viewer should see: an alert about one of their patients that is
 * either addressed to their role / the whole team, or one they raised
 * themselves (so they can track its status).
 */
export function visibleAlerts(
  alerts: CareAlertDoc[],
  viewer: { role: CareRole; uid: string; patientIds: string[] },
): CareAlertDoc[] {
  const ids = new Set(viewer.patientIds);
  return sortAlerts(
    alerts.filter(
      (a) =>
        ids.has(a.patientId) &&
        (a.raisedByUid === viewer.uid || audienceReaches(a.audience, viewer.role)),
    ),
  );
}

export function alertCounts(alerts: CareAlertDoc[]): { open: number; urgent: number } {
  let open = 0;
  let urgent = 0;
  for (const a of alerts) {
    if (a.status !== "resolved") {
      open += 1;
      if (a.severity === "urgent") urgent += 1;
    }
  }
  return { open, urgent };
}
