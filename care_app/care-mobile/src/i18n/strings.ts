/**
 * Caregiver-app UI strings.
 *
 * English is the source and is always present. `as` (Assamese) is translated for
 * the prototype and SHOULD be checked by a native speaker before real use — it
 * is isolated here so that is a one-file task. The other North-Eastern languages
 * fall back to English until translations are added; the picker still lists them
 * so the wiring is ready.
 *
 * Longer safety/legal sentences are deliberately left English-only.
 */
import type { Lang } from "./langs";

export type StringEntry = { en: string } & Partial<Record<Exclude<Lang, "en">, string>>;

export const STRINGS: Record<string, StringEntry> = {
  // -- navigation -----------------------------------------------------------
  "nav.patients": { en: "Patients", as: "ৰোগী" },
  "nav.alerts": { en: "Alerts", as: "সতৰ্কবাৰ্তা" },
  "nav.ask": { en: "Ask", as: "সোধক" },
  "nav.settings": { en: "Settings", as: "ছেটিংছ" },

  // -- common -------------------------------------------------------------
  "common.save": { en: "Save", as: "ৰাখক" },
  "common.cancel": { en: "Cancel", as: "বাতিল" },
  "common.add": { en: "Add", as: "যোগ কৰক" },
  "common.approve": { en: "Approve", as: "অনুমোদন কৰক" },
  "common.edit": { en: "Edit", as: "সলনি কৰক" },
  "common.remove": { en: "Remove", as: "আঁতৰাওক" },
  "common.change": { en: "Change", as: "সলনি কৰক" },
  "common.done": { en: "Done", as: "হ'ল" },
  "common.retry": { en: "Try again", as: "আকৌ চেষ্টা কৰক" },
  "common.back": { en: "Back", as: "পিছলৈ" },
  "common.loading": { en: "Loading…", as: "অলপ সময় দিয়ক…" },
  "common.saving": { en: "Saving…", as: "ৰাখি আছোঁ…" },

  // -- dashboard --------------------------------------------------------
  "dash.eyebrow": { en: "YOUR PATIENTS", as: "আপোনাৰ ৰোগীসকল" },
  "dash.title": { en: "Patients", as: "ৰোগী" },
  "dash.addPatient": { en: "Add a patient", as: "এজন ৰোগী যোগ কৰক" },
  "dash.none": { en: "No one set up yet.", as: "এতিয়ালৈকে কোনো যোগ কৰা হোৱা নাই।" },
  "dash.summary": { en: "{{count}} patients · {{paired}} paired", as: "{{count}} ৰোগী · {{paired}} সংযুক্ত" },
  "dash.summaryOne": { en: "1 patient · {{paired}} paired", as: "১ ৰোগী · {{paired}} সংযুক্ত" },
  "dash.paired": { en: "Paired", as: "সংযুক্ত" },
  "dash.awaiting": { en: "Awaiting code", as: "ক'ডৰ অপেক্ষাত" },
  "dash.emptyTitle": { en: "Add your first patient", as: "আপোনাৰ প্ৰথম ৰোগী যোগ কৰক" },
  "dash.emptyBody": {
    en: "Fill in their details and memories, then share the code so their phone can open the app.",
  },

  // -- patient detail --------------------------------------------------
  "patient.profileEyebrow": { en: "Patient profile", as: "ৰোগীৰ তথ্য" },
  "patient.pairingCode": { en: "PAIRING CODE", as: "সংযোগ ক'ড" },
  "patient.share": { en: "Share", as: "ভাগ কৰক" },
  "patient.newCode": { en: "New code", as: "নতুন ক'ড" },
  "patient.report": { en: "Weekly & monthly report", as: "সাপ্তাহিক আৰু মাহিলী প্ৰতিবেদন" },
  "patient.routine": { en: "Daily routine", as: "দৈনিক ৰুটিন" },
  "patient.medicines": { en: "Medicines", as: "ঔষধ" },
  "patient.raiseAlert": { en: "Raise an alert for the health worker", as: "স্বাস্থ্যকৰ্মীলৈ সতৰ্কবাৰ্তা পঠিয়াওক" },
  "patient.family": { en: "Family & contacts", as: "পৰিয়াল আৰু যোগাযোগ" },
  "patient.memories": { en: "Memories", as: "স্মৃতি" },
  "patient.assistantVoice": { en: "Assistant voice", as: "সহায়কৰ কণ্ঠ" },
  "patient.noContacts": { en: "No family contacts added.", as: "কোনো পৰিয়ালৰ যোগাযোগ যোগ কৰা হোৱা নাই।" },
  "patient.noMemories": { en: "No memories added yet.", as: "এতিয়ালৈকে কোনো স্মৃতি যোগ কৰা হোৱা নাই।" },
  "patient.record": { en: "Record", as: "ৰেকৰ্ড কৰক" },
  "patient.reRecord": { en: "Re-record", as: "পুনৰ ৰেকৰ্ড কৰক" },
  "patient.changePhoto": { en: "Change photo", as: "ফটো সলনি কৰক" },
  "patient.addPhoto": { en: "Add photo", as: "ফটো যোগ কৰক" },

  // -- daily routine -------------------------------------------------
  "routine.eyebrow": { en: "DAILY ROUTINE", as: "দৈনিক ৰুটিন" },
  "routine.title": { en: "{{name}}'s day", as: "{{name}}ৰ দিনটো" },
  "routine.starterWeek": { en: "Add a starter week", as: "আৰম্ভণিৰ এসপ্তাহ যোগ কৰক" },
  "routine.buildMyself": { en: "Build it myself", as: "নিজে সাজোঁ" },
  "routine.letRemiDraft": { en: "Let Remi draft this day", as: "Remi-ক এই দিনটো সাজিবলৈ দিয়ক" },
  "routine.reDraft": { en: "Re-draft with Remi", as: "Remi-ৰে পুনৰ সাজক" },
  "routine.approveDay": { en: "Approve this day", as: "এই দিনটো অনুমোদন কৰক" },
  "routine.saveApprove": { en: "Save & approve", as: "ৰাখক আৰু অনুমোদন কৰক" },
  "routine.saveChanges": { en: "Save changes", as: "সালসলনি ৰাখক" },
  "routine.addItem": { en: "Add an item", as: "এটা কাম যোগ কৰক" },
  "routine.time": { en: "TIME", as: "সময়" },
  "routine.what": { en: "WHAT", as: "কি" },
  "routine.item": { en: "ITEM {{n}}", as: "কাম {{n}}" },
  "routine.drafting": { en: "Drafting…", as: "সাজি আছোঁ…" },
  "routine.adding": { en: "Adding…", as: "যোগ কৰি আছোঁ…" },
  "routine.approving": { en: "Approving…", as: "অনুমোদন কৰি আছোঁ…" },

  // -- routine kinds --------------------------------------------------
  "kind.medicine": { en: "Medicine", as: "ঔষধ" },
  "kind.meal": { en: "Meal", as: "আহাৰ" },
  "kind.activity": { en: "Activity", as: "কাম" },
  "kind.exercise": { en: "Exercise", as: "ব্যায়াম" },
  "kind.hygiene": { en: "Wash & dress", as: "গা ধোৱা আৰু কাপোৰ পিন্ধা" },
  "kind.social": { en: "Family time", as: "পৰিয়ালৰ সময়" },
  "kind.rest": { en: "Rest", as: "জিৰণি" },
  "kind.other": { en: "Other", as: "অন্য" },

  // -- medicines ----------------------------------------------------
  "med.eyebrow": { en: "MEDICINES", as: "ঔষধ" },
  "med.title": { en: "{{name}}'s doses", as: "{{name}}ৰ ঔষধ" },
  "med.today": { en: "TODAY", as: "আজি" },
  "med.history": { en: "HISTORY", as: "আগৰ দিনবোৰ" },
  "med.taken": { en: "Taken", as: "খোৱা হৈছে" },
  "med.missed": { en: "Missed", as: "বাদ পৰিছে" },
  "med.skipped": { en: "Skipped", as: "এৰি দিয়া" },
  "med.pending": { en: "Pending", as: "বাকী আছে" },
  "med.logAnother": { en: "LOG ANOTHER DOSE", as: "আন এটা ঔষধ লিখক" },
  "med.name": { en: "Medicine name", as: "ঔষধৰ নাম" },
  "med.lastNDays": { en: "Last {{n}} days", as: "যোৱা {{n}} দিন" },
  "med.nothingLogged": { en: "Nothing logged yet.", as: "এতিয়ালৈকে একো লিখা হোৱা নাই।" },
  "med.important": { en: "important", as: "গুৰুত্বপূৰ্ণ" },

  // -- settings ---------------------------------------------------
  "settings.eyebrow": { en: "Your account", as: "আপোনাৰ একাউণ্ট" },
  "settings.title": { en: "Settings", as: "ছেটিংছ" },
  "settings.language": { en: "App language", as: "এপৰ ভাষা" },
  "settings.languageHint": {
    en: "English plus one North-Eastern language. Choose the one you read most comfortably.",
    as: "ইংৰাজীৰ লগতে এটা উত্তৰ-পূৱৰ ভাষা। আপুনি সহজে পঢ়িব পৰা ভাষাটো বাছক।",
  },
  "settings.notifications": { en: "Notifications", as: "জাননী" },
  "settings.privacy": { en: "Privacy", as: "গোপনীয়তা" },
  "settings.signOut": { en: "Sign out", as: "লগ আউট কৰক" },

  // -- chat -----------------------------------------------------
  "chat.eyebrow": { en: "ASK REMI", as: "Remi-ক সোধক" },
  "chat.title": { en: "Care assistant", as: "যত্নৰ সহায়ক" },
  "chat.placeholder": { en: "Ask about daily care…", as: "দৈনন্দিন যত্নৰ বিষয়ে সোধক…" },
  "chat.clear": { en: "Clear", as: "মচক" },
  "chat.tryAsking": { en: "TRY ASKING", as: "এইবোৰ সোধি চাওক" },
  "chat.thinking": { en: "Remi is thinking…", as: "Remi ভাবি আছে…" },

  // -- add memory ---------------------------------------------
  "memory.newTitle": { en: "New memory", as: "নতুন স্মৃতি" },
  "memory.title": { en: "Title", as: "শিৰোনাম" },
  "memory.story": { en: "The story", as: "কাহিনীটো" },
  "memory.picture": { en: "PICTURE (OPTIONAL)", as: "ছবি (বৈকল্পিক)" },
  "memory.addPhoto": { en: "Add a photo for this memory", as: "এই স্মৃতিৰ বাবে এখন ফটো যোগ কৰক" },
  "memory.favourite": { en: "Mark as a favourite", as: "প্ৰিয় বুলি চিহ্নিত কৰক" },
  "memory.add": { en: "Add memory", as: "স্মৃতি যোগ কৰক" },
};

/** Look up a string in `lang`, falling back to English, then the key itself. */
export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  const entry = STRINGS[key];
  let out: string = entry ? (lang === "en" ? entry.en : (entry as Record<string, string>)[lang] ?? entry.en) : key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.split(`{{${name}}}`).join(String(value));
    }
  }
  return out;
}
