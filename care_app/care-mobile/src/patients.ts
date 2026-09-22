/**
 * Firestore data layer for patient provisioning.
 *
 * Layout:
 *   patients/{id}                     PatientDoc (owned by caregiverUid)
 *   patients/{id}/memories/{mid}      MemoryDoc
 *   codes/{CODE}                      { patientId, caregiverUid, createdAt, expiresAt, active }
 *
 * The patient app never signs in as a caregiver: it uses anonymous auth and
 * reads a code to find its patient, so `codes` and `patients` are readable by
 * any signed-in user (see firestore.rules), while writes are owner-only.
 */
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { codeExpiry, generateCode, isExpired, isValidCode, normaliseCode } from "./codes";
import type { CareRole } from "./healthModel";
import {
  cleanContacts,
  cleanMemories,
  type Contact,
  type ContactDraft,
  type MemoryDoc,
  type MemoryDraft,
  type PatientDoc,
  type PatientDraft,
  type VoiceSample,
  type VoiceSampleMeta,
} from "./model";

function requireUid(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Please sign in again.");
  return uid;
}

/** Finds a pairing code no other patient is using (retries on the rare clash). */
async function reserveCode(): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = generateCode();
    const existing = await getDoc(doc(db, "codes", code));
    if (!existing.exists()) return code;
  }
  throw new Error("Could not allocate a pairing code. Try again.");
}

export type CreatedPatient = { id: string; code: string };

export async function createPatient(
  draft: PatientDraft,
  memories: MemoryDraft[],
  opts: { as?: CareRole } = {},
): Promise<CreatedPatient> {
  const creatorUid = requireUid();
  const createdByRole: CareRole = opts.as ?? "caregiver";
  const code = await reserveCode();

  const patientRef = doc(collection(db, "patients"));
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);

  batch.set(patientRef, {
    displayName: draft.displayName.trim(),
    preferredName: draft.preferredName.trim(),
    age: Math.round(draft.age),
    stateId: draft.stateId,
    village: draft.village?.trim() || null,
    language: draft.language,
    largeText: draft.largeText,
    reducedMotion: draft.reducedMotion,
    audioGuidance: draft.audioGuidance,
    contacts: cleanContacts(draft.contacts ?? []),
    photoUrl: null,
    voice: null,
    // The owner field is historically `caregiverUid`; for a worker-created
    // record it holds the worker's uid so the existing owner rules still apply.
    caregiverUid: creatorUid,
    createdByRole,
    createdByUid: creatorUid,
    ...(createdByRole === "healthcare_worker" ? { workerUids: [creatorUid] } : {}),
    createdAt: nowIso,
    createdAtTs: serverTimestamp(),
    code,
    pairedAt: null,
  });

  for (const memory of cleanMemories(memories)) {
    batch.set(doc(collection(patientRef, "memories")), { ...memory, createdAt: nowIso });
  }

  batch.set(doc(db, "codes", code), {
    patientId: patientRef.id,
    caregiverUid: creatorUid,
    createdAt: nowIso,
    expiresAt: codeExpiry().toISOString(),
    active: true,
  });

  await batch.commit();
  return { id: patientRef.id, code };
}

export async function regeneratePairingCode(patientId: string): Promise<string> {
  const caregiverUid = requireUid();
  const patientSnap = await getDoc(doc(db, "patients", patientId));
  if (!patientSnap.exists()) throw new Error("Patient not found.");
  const previous = patientSnap.data().code as string | undefined;

  const code = await reserveCode();
  const nowIso = new Date().toISOString();
  const batch = writeBatch(db);
  if (previous) batch.update(doc(db, "codes", previous), { active: false });
  batch.set(doc(db, "codes", code), {
    patientId,
    caregiverUid,
    createdAt: nowIso,
    expiresAt: codeExpiry().toISOString(),
    active: true,
  });
  batch.update(doc(db, "patients", patientId), { code });
  await batch.commit();
  return code;
}

export async function listPatients(): Promise<PatientDoc[]> {
  const uid = requireUid();
  // Filter in Firestore, sort on the device — a caregiver has only a handful of
  // patients, and this avoids needing a composite (caregiverUid + createdAt)
  // index in the Firebase console.
  const snap = await getDocs(query(collection(db, "patients"), where("caregiverUid", "==", uid)));
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientDoc, "id">) }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

/** Patients a health worker is on the care team for (created or linked by code). */
export async function listWorkerPatients(): Promise<PatientDoc[]> {
  const uid = requireUid();
  const snap = await getDocs(
    query(collection(db, "patients"), where("workerUids", "array-contains", uid)),
  );
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<PatientDoc, "id">) }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export type LinkedPatient = { id: string; name: string };

/**
 * A health worker joins the care team of a patient a caregiver already set up,
 * using the same 6-character code shown on the patient's profile. This only adds
 * the worker's uid to `workerUids` — it does not consume the code, so the
 * patient's own device can still pair with it.
 */
export async function linkPatientByCode(rawCode: string): Promise<LinkedPatient> {
  const uid = requireUid();
  const code = normaliseCode(rawCode);
  if (!isValidCode(code)) throw new Error("That code doesn't look right — it's 6 letters and numbers.");

  const codeSnap = await getDoc(doc(db, "codes", code));
  if (!codeSnap.exists()) throw new Error("No patient found for that code. Ask the caregiver to check it.");
  const codeData = codeSnap.data() as { patientId?: string; active?: boolean; expiresAt?: string };
  if (codeData.active === false) throw new Error("That code has been replaced. Ask the caregiver for the current one.");
  if (codeData.expiresAt && isExpired(codeData.expiresAt)) {
    throw new Error("That code has expired. Ask the caregiver to make a new one.");
  }
  if (!codeData.patientId) throw new Error("That code is not set up correctly. Ask the caregiver to make a new one.");

  const patientRef = doc(db, "patients", codeData.patientId);
  const patientSnap = await getDoc(patientRef);
  if (!patientSnap.exists()) throw new Error("That patient could not be found.");
  const data = patientSnap.data() as Partial<PatientDoc>;

  if (!(data.workerUids ?? []).includes(uid)) {
    await updateDoc(patientRef, { workerUids: arrayUnion(uid) });
  }
  return { id: patientRef.id, name: data.preferredName || data.displayName || "Patient" };
}

export async function getPatient(patientId: string): Promise<PatientDoc | null> {
  const snap = await getDoc(doc(db, "patients", patientId));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Omit<PatientDoc, "id">) } : null;
}

export async function listMemories(patientId: string): Promise<MemoryDoc[]> {
  const snap = await getDocs(collection(doc(db, "patients", patientId), "memories"));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MemoryDoc, "id">) }));
}

/** Stores the profile photo (a base64 data URI) on the patient doc. */
export async function setPatientPhoto(patientId: string, photoUrl: string): Promise<void> {
  await updateDoc(doc(db, "patients", patientId), { photoUrl });
}

/** Stores the caregiver's recorded voice so the patient app's assistant can
 *  speak in it. The audio (base64 m4a data URI) goes in its own
 *  `patients/{id}/voice/sample` doc; the patient doc gets a small marker. */
export async function setPatientVoiceSample(
  patientId: string,
  sample: { dataUri: string; durationSec: number; transcript: string },
): Promise<void> {
  const recordedAt = new Date().toISOString();
  const meta: VoiceSampleMeta = { recordedAt, durationSec: Math.round(sample.durationSec) };
  const batch = writeBatch(db);
  batch.set(doc(db, "patients", patientId, "voice", "sample"), { ...sample, ...meta } satisfies VoiceSample);
  batch.update(doc(db, "patients", patientId), { voice: meta });
  await batch.commit();
}

export async function getPatientVoiceSample(patientId: string): Promise<VoiceSample | null> {
  const snap = await getDoc(doc(db, "patients", patientId, "voice", "sample"));
  return snap.exists() ? (snap.data() as VoiceSample) : null;
}

export async function clearPatientVoiceSample(patientId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, "patients", patientId, "voice", "sample"));
  batch.update(doc(db, "patients", patientId), { voice: null });
  await batch.commit();
}

/** Replaces the patient's family contacts (name + phone shown in "Call Family"). */
export async function updatePatientContacts(patientId: string, contacts: ContactDraft[]): Promise<Contact[]> {
  const cleaned = cleanContacts(contacts);
  await updateDoc(doc(db, "patients", patientId), { contacts: cleaned });
  return cleaned;
}

export async function addMemory(patientId: string, memory: MemoryDraft): Promise<void> {
  const [clean] = cleanMemories([memory]);
  if (!clean) throw new Error("Add a title and a short story.");
  await addDoc(collection(doc(db, "patients", patientId), "memories"), {
    ...clean,
    createdAt: new Date().toISOString(),
  });
}

/** Optional: let a caregiver mark a device as unpaired again. */
export async function markUnpaired(patientId: string): Promise<void> {
  await updateDoc(doc(db, "patients", patientId), { pairedAt: null });
}

export async function ensureSetDoc(path: string, data: Record<string, unknown>): Promise<void> {
  await setDoc(doc(db, path), data, { merge: true });
}
