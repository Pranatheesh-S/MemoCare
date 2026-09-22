import { collection, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import type { ReportSession } from "./report";

/**
 * The patient app writes one doc per completed game session to
 * `patients/{id}/sessions/{eventId}` (see the patient app's
 * `firebase/sessionSync.ts`). Filtering on `playedAt >= sinceISO` needs only
 * the automatic single-field index.
 */
export async function listSessions(patientId: string, sinceISO: string): Promise<ReportSession[]> {
  const snap = await getDocs(
    query(collection(doc(db, "patients", patientId), "sessions"), where("playedAt", ">=", sinceISO)),
  );
  return snap.docs.map((d) => {
    const v = d.data() as Partial<ReportSession>;
    return {
      gameType: String(v.gameType ?? "MEMORY_MATCH"),
      difficulty: Number(v.difficulty ?? 1),
      accuracy: v.accuracy === null || v.accuracy === undefined ? null : Number(v.accuracy),
      responseTimeSeconds: Number(v.responseTimeSeconds ?? 0),
      hintsUsed: Number(v.hintsUsed ?? 0),
      attempts: Number(v.attempts ?? 0),
      completed: Boolean(v.completed),
      abandoned: Boolean(v.abandoned),
      engagementDurationSeconds: Number(v.engagementDurationSeconds ?? 0),
      playedAt: String(v.playedAt ?? new Date().toISOString()),
    };
  });
}
