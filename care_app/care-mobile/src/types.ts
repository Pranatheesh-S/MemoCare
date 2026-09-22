export type Role = "caregiver" | "healthcare_worker";
export type User = { id: string; role: Role; name: string; contact: string };
export type Patient = { id: string; displayName: string; age: number; language: string; location: { village?: string; state?: string }; deviceStatus: string; accessibility: { largeText: boolean; reducedMotion: boolean }; emergencyContacts: { name: string; relationship: string; phone: string }[] };
export type Alert = { id: string; patientId: string; type: string; severity: "info" | "attention" | "urgent"; summary: string; status: "open" | "acknowledged" | "escalated" | "resolved" };
export type Routine = { id: string; patientId: string; label: string; recurrence: string; critical: boolean; paused: boolean };
export type Visit = { id: string; patientId: string; authorName: string; mood: string; communicationOrientation: string; routineDifficulty: string; concernFlag: boolean; followUpAt?: string };
