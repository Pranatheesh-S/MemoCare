/**
 * Shared shapes for patient provisioning. Kept dependency-free so both this app
 * and the patient app can hold the same idea of a patient record (the patient
 * app has its own copy — the two must stay in step).
 */

/** The eight North-Eastern states. Each selects the patient app's content pack
 *  and narration language, so the patient app's whole look follows from this. */
export const NE_STATES = [
  { id: "AS", name: "Assam", language: "as", accent: "#0F6B5C" },
  { id: "AR", name: "Arunachal Pradesh", language: "njz", accent: "#B4530A" },
  { id: "MN", name: "Manipur", language: "mni", accent: "#9A1750" },
  { id: "ML", name: "Meghalaya", language: "kha", accent: "#1E6091" },
  { id: "MZ", name: "Mizoram", language: "lus", accent: "#3A6B35" },
  { id: "NL", name: "Nagaland", language: "nag", accent: "#7B2D8B" },
  { id: "SK", name: "Sikkim", language: "ne", accent: "#155E75" },
  { id: "TR", name: "Tripura", language: "trp", accent: "#A63A00" },
] as const;

export type NEStateId = (typeof NE_STATES)[number]["id"];

export function stateById(id: NEStateId) {
  return NE_STATES.find((s) => s.id === id) ?? NE_STATES[0];
}

export const MEMORY_CATEGORIES = [
  "MY_FAMILY",
  "MY_HOME",
  "MY_FESTIVALS",
  "MY_PLACES",
  "HAPPY_MOMENTS",
] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_CATEGORY_LABEL: Record<MemoryCategory, string> = {
  MY_FAMILY: "Family",
  MY_HOME: "Home",
  MY_FESTIVALS: "Festivals",
  MY_PLACES: "Places",
  HAPPY_MOMENTS: "Happy moments",
};

export type MemoryDraft = {
  category: MemoryCategory;
  /** For "Who is this?" — the person's name and how they relate to the patient. */
  personName?: string;
  relationship?: string;
  title: string;
  story: string;
  favourite?: boolean;
  /** A picture for this memory — a local file URI while editing, stored as a
   *  small base64 JPEG data URI (no Cloud Storage on Spark). Shown in the
   *  patient's memory gallery and used by the "Who is this?" game. */
  imageUri?: string;
};

/** A family member the patient can call from their app's "Call Family" screen. */
export type ContactDraft = {
  name: string;
  relationship: string;
  phone: string;
  isPrimary?: boolean;
};

/** A contact after cleaning — safe to write to Firestore. */
export type Contact = { name: string; relationship: string; phone: string; isPrimary: boolean };

export type PatientDraft = {
  displayName: string;
  preferredName: string;
  age: number;
  stateId: NEStateId;
  village?: string;
  /** Narration language; defaults from the state, caregiver may override. */
  language: string;
  largeText: boolean;
  reducedMotion: boolean;
  audioGuidance: boolean;
  contacts: ContactDraft[];
};

/** A short recording of the caregiver reading the reference sentences. The audio
 *  itself (a small base64 m4a data URI) lives in its own `patients/{id}/voice/sample`
 *  doc so it never competes with the profile photo for the 1 MiB patient-doc
 *  budget; the patient doc keeps only this lightweight marker. */
export type VoiceSampleMeta = { recordedAt: string; durationSec: number };

export type VoiceSample = VoiceSampleMeta & {
  dataUri: string;
  /** The exact words that were read — needed by the voice-cloning step. */
  transcript: string;
};

export type PatientDoc = PatientDraft & {
  id: string;
  /** The account that owns this record (a caregiver, or the worker who created it). */
  caregiverUid: string;
  createdAt: string;
  /** The current, active pairing code (denormalised so the list needs one read). */
  code: string;
  pairedAt?: string | null;
  /** Profile photo as a base64 data URI (small JPEG), shown on the patient home page. */
  photoUrl?: string | null;
  /** Marker for the caregiver's recorded assistant voice (audio in the
   *  `voice/sample` subcollection). Absent / null means "not recorded". */
  voice?: VoiceSampleMeta | null;
  /** Health-worker accounts on this patient's care team (added via a pairing code). */
  workerUids?: string[];
  /** Who first set the record up — decides which portal "owns" it. */
  createdByRole?: "caregiver" | "healthcare_worker";
  createdByUid?: string;
};

export type MemoryDoc = MemoryDraft & { id: string; createdAt: string };

export function emptyPatientDraft(): PatientDraft {
  return {
    displayName: "",
    preferredName: "",
    age: 70,
    stateId: "AS",
    village: "",
    language: "as",
    largeText: true,
    reducedMotion: false,
    audioGuidance: true,
    contacts: [],
  };
}

export function emptyMemoryDraft(): MemoryDraft {
  return { category: "MY_FAMILY", personName: "", relationship: "", title: "", story: "", favourite: false, imageUri: undefined };
}

export function emptyContactDraft(): ContactDraft {
  return { name: "", relationship: "", phone: "", isPrimary: false };
}

export type PatientValidationError = { field: keyof PatientDraft | "memories" | "contacts"; message: string };

/** Everything the "Create patient" button needs before it can be enabled. */
export function validatePatientDraft(
  draft: PatientDraft,
  memories: MemoryDraft[],
): PatientValidationError[] {
  const errors: PatientValidationError[] = [];
  if (draft.displayName.trim().length < 2) errors.push({ field: "displayName", message: "Enter the patient's name." });
  if (draft.preferredName.trim().length < 1) errors.push({ field: "preferredName", message: "Enter how they like to be addressed." });
  if (!Number.isFinite(draft.age) || draft.age < 40 || draft.age > 120) errors.push({ field: "age", message: "Enter an age between 40 and 120." });
  if (!NE_STATES.some((s) => s.id === draft.stateId)) errors.push({ field: "stateId", message: "Choose a state." });
  const usable = memories.filter((m) => m.title.trim() && m.story.trim());
  if (usable.length < 1) errors.push({ field: "memories", message: "Add at least one memory to personalise the games." });
  for (const c of draft.contacts) {
    const hasName = c.name.trim().length > 0;
    const hasPhone = c.phone.replace(/[^0-9]/g, "").length > 0;
    if (hasName !== hasPhone) {
      errors.push({ field: "contacts", message: "Each family contact needs both a name and a phone number." });
      break;
    }
    if (hasPhone && c.phone.replace(/[^0-9+]/g, "").replace(/\D/g, "").length < 7) {
      errors.push({ field: "contacts", message: "Enter a full phone number for each family contact." });
      break;
    }
  }
  return errors;
}

const PHONE_ALLOWED = /[^0-9+ ()-]/g;

export function cleanContacts(contacts: ContactDraft[]): Contact[] {
  const usable: Contact[] = contacts
    .map((c) => ({
      name: c.name.trim(),
      relationship: c.relationship.trim() || "Family",
      phone: c.phone.replace(PHONE_ALLOWED, "").trim(),
      isPrimary: Boolean(c.isPrimary),
    }))
    .filter((c) => c.name && c.phone.replace(/\D/g, "").length >= 7);
  if (usable.length > 0 && !usable.some((c) => c.isPrimary)) usable[0].isPrimary = true;
  return usable;
}

export function cleanMemories(memories: MemoryDraft[]): MemoryDraft[] {
  // Firestore rejects `undefined` field values, so optional keys are omitted
  // entirely (not set to undefined) when empty.
  return memories
    .filter((m) => m.title.trim() && m.story.trim())
    .map((m) => {
      const person = m.personName?.trim();
      const relationship = m.relationship?.trim();
      const image = m.imageUri?.trim();
      return {
        category: m.category,
        title: m.title.trim(),
        story: m.story.trim(),
        favourite: Boolean(m.favourite),
        ...(person ? { personName: person } : {}),
        ...(relationship ? { relationship } : {}),
        ...(image ? { imageUri: image } : {}),
      };
    });
}
