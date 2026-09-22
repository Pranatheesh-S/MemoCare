/**
 * Firestore layer for the health-worker portal.
 *
 *   patients/{id}/healthChecks/{hid}   append-only vitals + observations
 *   alerts/{aid}                        care-team alert feed (worker <-> caregiver)
 *
 * Pure helpers and shapes live in healthModel.ts so they can be unit-tested
 * without Firebase.
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import {
  cleanHealthCheck,
  type CareAlertDoc,
  type CareAlertDraft,
  type CareRole,
  type HealthCheckDoc,
  type HealthCheckDraft,
} from "./healthModel";

function me() {
  const u = auth.currentUser;
  if (!u) throw new Error("Please sign in again.");
  return { uid: u.uid, name: u.displayName ?? u.email?.split("@")[0] ?? "Care team" };
}

/* -------------------------------------------------------------------------- */
/*  Health checks                                                             */
/* -------------------------------------------------------------------------- */

export async function recordHealthCheck(patientId: string, draft: HealthCheckDraft): Promise<void> {
  const { uid, name } = me();
  await addDoc(collection(doc(db, "patients", patientId), "healthChecks"), {
    ...cleanHealthCheck(draft),
    recordedByUid: uid,
    recordedByName: name,
    recordedAt: new Date().toISOString(),
    recordedAtTs: serverTimestamp(),
  });
}

/** Newest first. Sorted on the device — a patient has few checks, so no index. */
export async function listHealthChecks(patientId: string, max = 60): Promise<HealthCheckDoc[]> {
  const snap = await getDocs(collection(doc(db, "patients", patientId), "healthChecks"));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<HealthCheckDoc, "id">) }))
    .sort((a, b) => (b.recordedAt ?? "").localeCompare(a.recordedAt ?? ""))
    .slice(0, max);
}

/* -------------------------------------------------------------------------- */
/*  Alerts                                                                    */
/* -------------------------------------------------------------------------- */

export async function raiseAlert(
  patient: { id: string; name: string },
  draft: CareAlertDraft,
  role: CareRole,
): Promise<void> {
  const { uid, name } = me();
  await addDoc(collection(db, "alerts"), {
    patientId: patient.id,
    patientName: patient.name,
    severity: draft.severity,
    message: draft.message.trim(),
    audience: draft.audience,
    kind: draft.kind ?? "note",
    ...(draft.healthCheckId ? { healthCheckId: draft.healthCheckId } : {}),
    raisedByUid: uid,
    raisedByName: name,
    raisedByRole: role,
    status: "open",
    createdAt: new Date().toISOString(),
    createdAtTs: serverTimestamp(),
  });
}

/** Every alert for the given patients. Firestore `in` takes ≤30 ids, so chunk. */
export async function listAlertsForPatients(patientIds: string[], max = 120): Promise<CareAlertDoc[]> {
  if (patientIds.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < patientIds.length; i += 30) chunks.push(patientIds.slice(i, i + 30));
  const snaps = await Promise.all(
    chunks.map((ids) => getDocs(query(collection(db, "alerts"), where("patientId", "in", ids)))),
  );
  return snaps
    .flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CareAlertDoc, "id">) })))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, max);
}

export async function setAlertStatus(alertId: string, status: "acknowledged" | "resolved"): Promise<void> {
  const { name } = me();
  const nowIso = new Date().toISOString();
  const patch: Record<string, string> =
    status === "acknowledged"
      ? { status, acknowledgedByName: name, acknowledgedAt: nowIso }
      : { status, resolvedByName: name, resolvedAt: nowIso };
  await updateDoc(doc(db, "alerts", alertId), patch);
}

/** Convenience for one patient — used from the patient hub. */
export async function getPatientName(patientId: string): Promise<string> {
  const snap = await getDoc(doc(db, "patients", patientId));
  if (!snap.exists()) return "Patient";
  const d = snap.data() as { preferredName?: string; displayName?: string };
  return d.preferredName || d.displayName || "Patient";
}
