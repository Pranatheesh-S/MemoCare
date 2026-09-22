/**
 * Firestore layer for daily routines, plus the AI draft.
 *
 *   patients/{id}/routineDays/{YYYY-MM-DD}   one RoutineDay per calendar day.
 *
 * A day the AI drafts is stored with `approved: false` and only goes live when
 * the caregiver taps Approve.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { geminiJson } from "./gemini";
import {
  MIN_DAYS_FOR_AI_SUGGESTIONS,
  ROUTINE_KINDS,
  addDays,
  cleanRoutineItems,
  sampleRoutineDays,
  summariseRoutineDays,
  weekdayOf,
  type RoutineDay,
  type RoutineItem,
} from "./routineModel";

const daysCol = (patientId: string) => collection(db, "patients", patientId, "routineDays");

export async function getRoutineDay(patientId: string, date: string): Promise<RoutineDay | null> {
  const snap = await getDoc(doc(daysCol(patientId), date));
  return snap.exists() ? (snap.data() as RoutineDay) : null;
}

/** All days on/after `sinceDate`, newest first (device-side sort — no index). */
export async function listRoutineDays(patientId: string, sinceDate: string): Promise<RoutineDay[]> {
  const snap = await getDocs(query(daysCol(patientId), where("date", ">=", sinceDate)));
  return snap.docs.map((d) => d.data() as RoutineDay).sort((a, b) => b.date.localeCompare(a.date));
}

export async function countApprovedDays(patientId: string): Promise<number> {
  const snap = await getDocs(query(daysCol(patientId), where("approved", "==", true)));
  return snap.size;
}

export async function saveRoutineDay(
  patientId: string,
  input: {
    date: string;
    items: RoutineItem[];
    source: RoutineDay["source"];
    approved: boolean;
    basedOnDays?: number;
  },
): Promise<RoutineDay> {
  const existing = await getRoutineDay(patientId, input.date);
  const now = new Date().toISOString();
  const day: RoutineDay = {
    date: input.date,
    items: cleanRoutineItems(input.items),
    source: input.source,
    approved: input.approved,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(input.basedOnDays ? { basedOnDays: input.basedOnDays } : {}),
  };
  await setDoc(doc(daysCol(patientId), input.date), day);
  return day;
}

export async function deleteRoutineDay(patientId: string, date: string): Promise<void> {
  await deleteDoc(doc(daysCol(patientId), date));
}

/** Writes a realistic starter week (5 approved past days). Refuses if the
 *  patient already has any routine days, so it can never overwrite real ones. */
export async function seedSampleRoutineDays(patientId: string): Promise<number> {
  const existing = await getDocs(daysCol(patientId));
  if (!existing.empty) throw new Error("This patient already has routine days.");
  const days = sampleRoutineDays();
  const batch = writeBatch(db);
  for (const day of days) batch.set(doc(daysCol(patientId), day.date), day);
  await batch.commit();
  return days.length;
}

const ROUTINE_SYSTEM_PROMPT = [
  "You draft one day's care routine for an elderly person living with dementia, for their family caregiver to review.",
  "Base it closely on the recent approved routines you are given: keep the same wake and sleep times, the same meals, and — most importantly — the SAME medicines at the SAME times. Never add, rename, or re-time a medicine that is not already in the history.",
  "Keep the person's familiar rhythm. Small, gentle variety in activities is fine; big changes are not.",
  "Favour calm, doable days over busy ones. Include short rests.",
  "Do not diagnose anything, do not comment on the person's condition, and do not give medical advice.",
  "Return 6-12 items covering morning to night, each with a 24-hour HH:MM time.",
].join("\n");

const ROUTINE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string", description: "24-hour HH:MM" },
          title: { type: "string" },
          kind: { type: "string", enum: [...ROUTINE_KINDS] },
          note: { type: "string" },
          critical: { type: "boolean" },
        },
        required: ["time", "title", "kind"],
      },
    },
  },
  required: ["items"],
};

/** An AI draft for `targetDate`, built from the last few weeks of approved days. */
export async function suggestRoutineItems(
  patientId: string,
  targetDate: string,
): Promise<{ items: RoutineItem[]; basedOnDays: number }> {
  const recent = (await listRoutineDays(patientId, addDays(targetDate, -21)))
    .filter((d) => d.approved && d.date < targetDate)
    .slice(0, 10);
  if (recent.length < MIN_DAYS_FOR_AI_SUGGESTIONS) {
    throw new Error(
      `Add and approve at least ${MIN_DAYS_FOR_AI_SUGGESTIONS} days first — then Remi can draft the next ones for you.`,
    );
  }
  const prompt = [
    "Recent approved daily routines:",
    "",
    summariseRoutineDays(recent),
    "",
    `Draft the routine for ${weekdayOf(targetDate)} ${targetDate}. Return items only.`,
  ].join("\n");
  const raw = await geminiJson<{ items?: RoutineItem[] }>(ROUTINE_SYSTEM_PROMPT, prompt, ROUTINE_SCHEMA);
  const items = cleanRoutineItems(raw.items ?? []);
  if (items.length === 0) throw new Error("The draft came back empty. Please try again.");
  return { items, basedOnDays: recent.length };
}
