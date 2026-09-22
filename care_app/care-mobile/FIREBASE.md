# Firebase — patient provisioning

The caregiver app (this `care-mobile`) and the patient app
(`SIH-2026/smritisetu-ai/apps/patient-mobile`) share one Firebase project,
**`sih-2026-c3a65`**, as their backend for the provisioning + pairing flow. No
server to run.

## Flow

1. **Caregiver signs up / in** — Firebase email/password auth (`src/auth.tsx`).
2. **Caregiver creates a patient** — `app/caregiver/patients/new.tsx`: name,
   age, **state** (drives the patient app's content pack + narration language),
   comfort settings, and a few **memories** (people, places, happy days).
3. `createPatient()` (`src/patients.ts`) writes, in one batch:
   - `patients/{id}` — the profile, owned by `caregiverUid`
   - `patients/{id}/memories/*`
   - `codes/{CODE}` — a 6-char code (`src/codes.ts`, alphabet has no 0/O/1/I)
4. **Caregiver reads the code aloud** to the patient (shown big on the patient
   detail screen; "New code" revokes the old one).
5. **Patient app** enters the code → anonymous Firebase auth → reads
   `codes/{CODE}` → `patients/{id}` + memories → maps to its offline package →
   the whole app (theme, pictures, festivals, games) is now that patient's.

## Firestore data

| Path | Written by | Read by |
| --- | --- | --- |
| `patients/{id}` | owning caregiver | any signed-in user |
| `patients/{id}/memories/{mid}` | owning caregiver | any signed-in user |
| `codes/{CODE}` | owning caregiver (create/revoke); patient app (`usedAt`) | `get` by code only — never listable |

## Setup (once, in the Firebase console — required, or every write is denied)

1. **Authentication → Sign-in method** → enable **Email/Password** *and* **Anonymous**.
2. **Firestore Database** → create the database.
3. **Firestore → Rules** tab → replace everything with the contents of
   [`../firestore.rules`](../firestore.rules) → **Publish**.
   Until you do this, Firestore stays locked and you get
   *"Missing or insufficient permissions."*

That's all. **No Cloud Storage and no Blaze upgrade needed** — profile photos
are stored as a small (< 670 KB) base64 JPEG on the patient's Firestore doc, so
everything runs on the free **Spark** plan. No composite index either: the
dashboard filters patients by `caregiverUid` and sorts on the device.

## What syncs to the patient app

| Set in the caregiver app | Where it shows in the patient app |
| --- | --- |
| State | Whole theme, festivals, food, narration language |
| Memories (people, places, days) | Who Is This?, Memory Lane, matching games |
| **Family contacts** (name + phone) | **Call Family** screen |
| **Profile photo** (base64 on the doc) | **Home screen** portrait |

The patient app writes back one doc per completed game to
`patients/{id}/sessions/{eventId}`; the caregiver app's **Weekly & monthly
report** (patient profile → *Weekly & monthly report*) charts those — activity
volume, accuracy, response time, hints, time engaged, per-activity breakdown and
best time of day.

Client config is public (it is the same as `google-services.json`) and lives in
`src/firebase.ts`; access is controlled by the rules above, not by hiding keys.
