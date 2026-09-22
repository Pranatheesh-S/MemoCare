/**
 * Firestore layer for the medicine log.
 *
 *   patients/{id}/medicineLog/{autoId}   append-only: one row per dose event.
 *
 * The caregiver logs doses here; the patient app can append to the same
 * collection later (same shape, `loggedByRole: "patient"`).
 */
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { MedicineLogEntry } from "./medicineModel";

const logCol = (patientId: string) => collection(db, "patients", patientId, "medicineLog");

/** Entries dated on/after `sinceDate` (device-side sort in the model helpers). */
export async function listMedicineLog(patientId: string, sinceDate: string): Promise<MedicineLogEntry[]> {
  const snap = await getDocs(query(logCol(patientId), where("date", ">=", sinceDate)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MedicineLogEntry, "id">) }));
}

export async function logMedicine(
  patientId: string,
  entry: Omit<MedicineLogEntry, "id" | "loggedAt">,
): Promise<void> {
  const clean: Omit<MedicineLogEntry, "id"> = {
    date: entry.date,
    name: entry.name.trim(),
    status: entry.status,
    loggedByRole: entry.loggedByRole,
    loggedAt: new Date().toISOString(),
    ...(entry.time ? { time: entry.time } : {}),
    ...(entry.loggedByName?.trim() ? { loggedByName: entry.loggedByName.trim() } : {}),
    ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
  };
  await addDoc(logCol(patientId), clean);
}
