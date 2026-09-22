# SmritiSetu AI — *Bridge to Memories*

An **offline-first cognitive gaming and memory-assistance platform** for elderly
dementia patients in the North Eastern Region of India.

> **SmritiSetu AI is a support tool, not a diagnostic platform.**
> It never diagnoses dementia, never recommends or changes medicines, and never
> claims a patient's condition has worsened. Reminder acknowledgements record
> that a patient pressed *Done* — never that a medicine was consumed. These are
> enforced in code ([`app/safety.py`](services/ml-service/app/safety.py)) and
> asserted in tests, not just documented here.

---

## Contents

| Section | |
| --- | --- |
| [What it does](#what-it-does) | The three components |
| [Quick start](#quick-start) | Running everything in five minutes |
| [Architecture](#architecture) | How the pieces fit together |
| [Setup](#setup) | Backend, ML service, mobile app, Docker |
| [Environment variables](#environment-variables) | Every variable, and where real credentials go |
| [Database](#database) | Migrations and seeding |
| [API](#api) | Endpoints and Swagger |
| [Testing](#testing) | Commands and current results |
| [The demo journey](#the-demo-journey) | The required 18-step walkthrough |
| [Regional content packs](#regional-content-packs) | Per-state, community-aware cultural content |
| [Custom accessibility voice](services/tts-service/README.md) | Narration in a caregiver's own cloned voice |
| [Security and privacy](#security-and-privacy) | Consent, media, tokens, audit |
| [Troubleshooting](#troubleshooting) | Common problems |
| [Prototype limitations](#prototype-limitations) | What is deliberately not finished |

---

## What it does

**Patient mobile application** (`apps/patient-mobile`) — an Expo/React Native app
designed for someone who may have memory, attention, vision and motor
difficulties. Four cognitive activities, a daily routine with reminders, a
personal memory gallery, one-tap family calling, voice guidance in Assamese and
English, and a clearly visible *I Need Help*. It works with no network at all:
everything is stored in SQLite on the device and synchronised when a connection
returns.

**Backend API** (`services/backend-api`) — Express + Prisma + PostgreSQL. Device
pairing, role-based access with a strict patient-assignment gate, an idempotent
offline sync endpoint, a consent-linked memory vault with signed media URLs, and
an explainable alert engine.

**ML personalisation service** (`services/ml-service`) — FastAPI. Decides how
gentle or how challenging the next activity should be, and summarises engagement
trends for a caregiver. Deterministic, explainable rules first; an optional
anomaly detector as a secondary signal only.

**Custom voice service** (`services/tts-service`) — FastAPI + Qwen3-TTS.
Optional. Given one 30–45 second recording of a caregiver's voice, it generates
every fixed phrase in the app once into bundled clips, and speaks changing text —
companion replies, personalised reminders — as it is needed. Narration stays
instant and offline because the fixed phrases never touch the model at run time.
With the service absent or `TTS_ENABLED=false`, the app narrates with the
device's own speech engine exactly as before. See
[its README](services/tts-service/README.md).

---

## Quick start

Prerequisites: **Node 18+**, **Python 3.12**, and either **Docker** or a local
**PostgreSQL 14+**.

### With Docker

```bash
git clone <this repository>
cd smritisetu-ai
cp .env.example .env                 # defaults work for local development
docker compose up --build            # postgres + backend + ml service

# In a second terminal, seed the demonstration patient:
docker compose exec backend-api npx prisma migrate deploy
docker compose exec backend-api npx tsx prisma/seed.ts
```

### Without Docker

```bash
cd smritisetu-ai
npm install

# 1. PostgreSQL
createdb smritisetu

# 2. Backend
cd services/backend-api
cp .env.example .env                 # then set DATABASE_URL for your machine
npx prisma migrate deploy
npm run db:seed
npm run dev                          # http://localhost:4000  (docs at /docs)

# 3. ML service (new terminal)
cd services/ml-service
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --port 8000    # docs at /docs

# 4. Patient app (new terminal)
cd apps/patient-mobile
cp .env.example .env                 # set your LAN IP for a physical device
npm start                            # press a for Android, i for iOS
```

Then pair the app with **`123456`**, or press **Use demo setup**.

---

## Architecture

```
┌──────────────────────────┐
│  Patient mobile app      │  Expo · React Native · TypeScript
│                          │
│  ┌────────────────────┐  │  Screens never touch SQL or the network directly.
│  │ Screens (routes)   │  │
│  └─────────┬──────────┘  │
│  ┌─────────┴──────────┐  │
│  │ Repositories       │──┼──▶ SQLite  (patient_profile, schedules,
│  │ Game logic (pure)  │  │            reminder_events, game_sessions,
│  │ Reminder manager   │  │            memory_assets, sync_queue, …)
│  └─────────┬──────────┘  │
│  ┌─────────┴──────────┐  │       Local notifications fire with no network.
│  │ Sync engine        │  │
│  └─────────┬──────────┘  │
└────────────┼─────────────┘
             │  POST /api/v1/sync/events   (batched, idempotent, backed off)
             ▼
┌──────────────────────────┐        ┌─────────────────────────────┐
│  Backend API             │───────▶│  ML personalisation service │
│  Express · Prisma        │  HTTP  │  FastAPI                    │
│                          │◀───────│                             │
│  · auth + role gate      │        │  · rule engine (difficulty) │
│  · patient assignment    │        │  · trend analysis (robust)  │
│  · sync ingestion        │        │  · anomaly (secondary only) │
│  · alert engine          │        │  · safety guard on output   │
│  · memory vault + consent│        └─────────────────────────────┘
└────────────┬─────────────┘         ML being down never blocks a game:
             ▼                       difficulty simply holds.
        PostgreSQL
```

### Design decisions worth knowing

**The device is the source of truth while offline.** Every event is written to
SQLite *before* any attempt to send it, and is deleted locally only once the
server confirms it. A crash mid-send loses nothing.

**Idempotency is structural, not defensive.** The client-generated `eventId` is
the primary key of the device's sync queue and carries a `(deviceId, eventId)`
unique constraint on the server. A replayed batch cannot create a duplicate even
if two syncs race.

**Nothing is silently overwritten.** A reminder that references an outdated
medicine or routine schedule is still stored — it is real history — but the
version conflict is reported so a caregiver can reconcile it. Schedule edits
append a `ScheduleVersion` snapshot; nothing is lost.

**Alert deduplication is a database constraint.** A unique
`(patientId, dedupeKey)` row, released on resolve, rather than a read-then-write
check that two concurrent batches could both slip past.

**Game logic is pure and separate from rendering.** Illustrations are referenced
by id, so all four activities are tested as plain functions.

**Safety is enforced, not assumed.** The ML service scans every outgoing
explanation for clinical language and refuses to return it if found. Difficulty
is clamped to one level per change in three independent places (rule engine,
safety module, backend).

---

## Setup

### Backend (`services/backend-api`)

```bash
cd services/backend-api
cp .env.example .env
npx prisma migrate deploy     # or `npm run db:migrate` in development
npm run db:seed
npm run dev                   # tsx watch, http://localhost:4000
npm run build && npm start    # production
```

| Script | |
| --- | --- |
| `npm run dev` | Watch mode |
| `npm run build` | Compile to `dist/` |
| `npm run db:migrate` | Create and apply a migration (development) |
| `npm run db:deploy` | Apply existing migrations (production) |
| `npm run db:seed` | Seed the Aita demonstration data |
| `npm run db:reset` | Drop, re-migrate and re-seed |
| `npm run db:studio` | Prisma Studio |
| `npm test` | Vitest suite |
| `npm run typecheck` | `tsc --noEmit` |

### ML service (`services/ml-service`)

```bash
cd services/ml-service
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn app.main:app --reload --port 8000
.venv/bin/python -m pytest -q
```

Python 3.12 is recommended: scikit-learn wheels are reliably available there.
The service degrades safely without scikit-learn — it falls back to a robust
z-score, and then to the rule engine alone.

### Patient app (`apps/patient-mobile`)

```bash
cd apps/patient-mobile
cp .env.example .env
npm start            # then a (Android), i (iOS), or scan the QR code
npm test             # unit tests
npm run typecheck
```

**On a physical device, `localhost` is the phone, not your computer.** Set your
machine's LAN address:

```bash
# .env
EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
```

Then make sure the backend allows it:

```bash
# services/backend-api/.env
CORS_ORIGINS=http://localhost:8081,http://192.168.1.20:8081
```

### Docker

```bash
cp .env.example .env
docker compose up --build            # postgres, ml-service, backend-api
docker compose exec backend-api npx tsx prisma/seed.ts
docker compose logs -f backend-api
docker compose down -v               # also removes the database volume
```

The mobile app is **not** containerised — Expo runs on the developer's machine
and connects to the containerised backend.

---

## Environment variables

Every variable is documented in [`.env.example`](.env.example), with per-service
copies in `services/backend-api/.env.example`,
`services/ml-service/.env.example` and `apps/patient-mobile/.env.example`.
No file in this repository contains a real secret.

### Where real credentials must go

The prototype runs end to end with **no external credential at all**. Three
integration points are wired but deliberately left on a local fallback:

| Capability | Prototype behaviour | To use the real thing |
| --- | --- | --- |
| **Media storage** | Files on local disk, served through HMAC-signed expiring URLs | Set `MEDIA_DRIVER=s3` and supply `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. The signed-URL contract in [`lib/signedUrl.ts`](services/backend-api/src/lib/signedUrl.ts) does not change. |
| **Push notifications** | Logged to the console by [`lib/notifications.ts`](services/backend-api/src/lib/notifications.ts) | Set `FCM_ENABLED=true` and supply `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`. Call sites do not change. Patient reminders do **not** depend on this — they are scheduled locally on the device. |
| **Recorded voice prompts** | On-device text-to-speech over the translated string | Drop `.m4a` files into `apps/patient-mobile/assets/audio/<lang>/` and set `localAssetPath` in the audio-prompt manifest. Online TTS is never used for essential offline functions. |
| **Narration in a real voice** | The device's own speech engine | Record 30–45 seconds of one voice and run [`services/tts-service`](services/tts-service/README.md). Every fixed phrase is generated once into bundled clips; only changing text is generated at run time. Nothing about this is required — with it off the app narrates exactly as before. |

### Key variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | — | PostgreSQL connection string (required) |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | dev values | Generate with `openssl rand -base64 48` |
| `MEDIA_SIGNING_SECRET` | dev value | Signs media URLs; rotating it invalidates outstanding links |
| `ML_SERVICE_URL` | `http://localhost:8000` | Personalisation service |
| `ML_SERVICE_ENABLED` | `true` | Set `false` to run with difficulty frozen |
| `ALERT_MISSED_CRITICAL_THRESHOLD` | `2` | Missed critical reminders before an alert |
| `ML_TREND_MIN_SESSIONS` | `5` | Minimum sessions before any trend is reported |
| `ML_TREND_MIN_INDICATORS` | `2` | Indicators that must move before review is suggested |
| `EXPO_PUBLIC_API_URL` | `http://localhost:4000` | Backend, as seen from the phone |
| `EXPO_PUBLIC_DEMO_MODE` | `true` | Shows *Use demo setup*. **Turn off for any real deployment.** |

---

## Database

```bash
cd services/backend-api

npx prisma migrate dev --name <description>   # create + apply (development)
npx prisma migrate deploy                     # apply only (production/CI)
npx prisma migrate reset --force              # drop, re-migrate, re-seed
npm run db:seed                               # seed only
npx prisma studio                             # browse
```

Conventions: UUID primary keys, UTC timestamps (`@db.Timestamptz`), indexes on
`(patientId, <time>)`, `(deviceId, eventId)` uniqueness on every append-only
event table, and soft deletes wherever audit history matters.

### Seeded demonstration data

| | |
| --- | --- |
| Patient | **Aita**, 72, Jorhat, Assam, prefers Assamese |
| Pairing code | **`123456`** (reusable — see [limitations](#prototype-limitations)) |
| Caregiver | `daughter@smritisetu.demo` / `Caregiver#2026` |
| Health worker (ASHA) | `asha@smritisetu.demo` / `AshaWorker#2026` |
| Admin | `admin@smritisetu.demo` / `AdminUser#2026` |
| Content | 4 family contacts · 6 family photos · 4 personal memories · 2 medicines · 3 routines · 7 schedules |
| History | 39 game sessions over 14 days · 18 reminder events (acknowledged, snoozed and missed) · 1 explainable non-diagnostic trend observation |
| Second patient | **Koka**, deliberately *not* assigned to the caregiver, so the access gate is demonstrable |
| Regional patients | One demo patient per North Eastern state (pairing codes `610001`–`610007`), each with its `stateId`, community, language and a few pack memories — see [Regional content packs](#regional-content-packs) |

No real patient data is used. Family photographs are generated abstract
placeholder images and voice clips are silent placeholder WAVs
([`generate-placeholder-media.py`](services/backend-api/prisma/generate-placeholder-media.py)),
so nobody's likeness or voice appears anywhere in this repository.

---

## API

Interactive documentation while the backend is running:

- **Swagger UI** — <http://localhost:4000/docs>
- **OpenAPI JSON** — <http://localhost:4000/openapi.json>
- **ML service** — <http://localhost:8000/docs>

| Group | Endpoints |
| --- | --- |
| Health | `GET /health` · `GET /ready` |
| Auth | `POST /api/v1/auth/register` · `login` · `refresh` · `logout` · `POST /api/v1/devices/pair` |
| Patients | `GET|PATCH /api/v1/patients/:patientId` · `GET …/offline-package` · `GET …/game-config` · `POST …/pairing-codes` |
| Schedules | `GET|POST /api/v1/patients/:patientId/schedules` · `PATCH|DELETE /api/v1/schedules/:scheduleId` · `GET …/versions` |
| Sync | `POST /api/v1/sync/events` · `GET /api/v1/sync/status/:deviceId` |
| Games | `POST /api/v1/game-sessions` · `GET …/game-sessions` · `GET …/trends?period=7d|30d` · `GET …/difficulty-profiles` · `GET …/adaptation-history` |
| Memory vault | `POST …/memories/upload-url` · `POST|GET …/memories` · `DELETE /api/v1/memories/:memoryId` · `POST|GET …/consents` · `POST /api/v1/consents/:consentId/withdraw` · `GET /api/v1/media/:key` |
| Alerts | `GET …/alerts` · `POST /api/v1/alerts/:alertId/acknowledge|escalate|resolve` |

The ML service exposes `POST /v1/adaptation/recommend`,
`POST /v1/trends/analyse`, `POST /v1/engagement/recommend` and `GET /health`.

Every response is `{ data, requestId }`; every failure is
`{ error: { code, message, details?, requestId } }`.

---

## Testing

```bash
# Backend — needs PostgreSQL; creates and migrates `smritisetu_test`
npm run test:backend                          # or: npm test -w @smritisetu/backend-api

# ML service
cd services/ml-service && .venv/bin/python -m pytest -q

# Custom voice service — runs against a stand-in engine, so it needs no model
cd services/tts-service && .venv/bin/python -m pytest -q

# Mobile unit tests — real SQLite via node:sqlite, no emulator needed
npm run test:mobile                           # or: npm test -w @smritisetu/patient-mobile

# Mobile end-to-end against a running backend + ML service
npm run test:integration -w @smritisetu/patient-mobile

# Type checking across every workspace
npm run typecheck
```

### Current results

| Suite | Tests | Result |
| --- | --- | --- |
| Backend (Vitest + Supertest, real PostgreSQL) | 126 | ✅ passing |
| ML service (pytest) | 108 | ✅ passing |
| Custom voice service (pytest, stand-in engine) | 61 | ✅ passing |
| Mobile unit (node:test, real SQLite) | 188 | ✅ passing |
| Mobile end-to-end (live backend + ML) | 10 | ✅ passing |
| **Total** | **432** | ✅ |

The mobile suites run the real application source with no build step: a resolver
hook ([`src/testing/tsResolver.mjs`](apps/patient-mobile/src/testing/tsResolver.mjs))
resolves extensionless imports the way Metro does, and for the integration suite
maps the native modules to plain-Node stand-ins. The repositories' actual SQL and
migrations execute against real SQLite.

The integration suite **skips itself** when no backend is reachable, so
`npm run test:mobile` stays green offline.

---

## The demo journey

Start all three services, then:

```bash
npm run test:integration -w @smritisetu/patient-mobile
```

This walks the required workflow automatically. To do it by hand in the app:

| Step | What happens |
| --- | --- |
| 1 | Start PostgreSQL, the backend and the ML service |
| 2 | Launch the patient app (`npm start` in `apps/patient-mobile`) |
| 3 | Pair with **`123456`** (or press *Use demo setup*) |
| 4 | Aita's Assamese offline package downloads — 162 strings, schedules, contacts, consented photos |
| 5 | **Turn off Wi-Fi and mobile data.** The header changes to *Working offline* |
| 6 | Play **Picture Pairs** — cards preview, then hide |
| 7 | Play **Who Is This?** — family photographs from the device's own cache |
| 8 | Both sessions are written to SQLite and queued |
| 9–11 | A medicine reminder falls due and its window elapses; it becomes *We will remind you again* and a pending event is created |
| 12 | **Turn connectivity back on** |
| 13 | The sync engine sends everything; *Saving status* shows the time |
| 14 | Replaying the batch returns duplicates — nothing is stored twice |
| 15–16 | The ML service evaluates the sessions and the backend stores the new difficulty with its evidence and explanation |
| 17 | An explainable missed-reminder alert appears for the caregiver |
| 18 | The app shows a successful synchronisation |

Inspect the results as the caregiver:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"daughter@smritisetu.demo","password":"Caregiver#2026"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['tokens']['accessToken'])")

PATIENT=$(curl -s -X POST http://localhost:4000/api/v1/devices/pair \
  -H 'content-type: application/json' \
  -d '{"pairingCode":"123456","deviceIdentifier":"inspect-cli"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['patientId'])")

curl -s "http://localhost:4000/api/v1/patients/$PATIENT/alerts" -H "authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s "http://localhost:4000/api/v1/patients/$PATIENT/trends?period=7d" -H "authorization: Bearer $TOKEN" | python3 -m json.tool
curl -s "http://localhost:4000/api/v1/patients/$PATIENT/adaptation-history" -H "authorization: Bearer $TOKEN" | python3 -m json.tool
```

A representative trend response — explainable, evidence-backed, and explicitly
not a diagnosis:

```json
{
  "status": "REVIEW_SUGGESTED",
  "reasonCode": "SUSTAINED_ACCURACY_CHANGE",
  "explanation": "Across the last 7 days (16 comparable sessions) the patient answered fewer items correctly compared with the previous 7 days. The patient also required more hints. Caregiver review is suggested. This is not a diagnosis.",
  "isDiagnosis": false,
  "indicators": [
    { "name": "median_accuracy", "current": 0.69, "baseline": 0.86, "direction": "DOWN", "sampleSize": 16 },
    { "name": "hints_per_session", "current": 2, "baseline": 1, "direction": "UP", "sampleSize": 16 }
  ]
}
```

---

## Regional content packs

**The North Eastern Region is not one culture.** Reminiscence therapy only works
with material a patient actually grew up around, so the familiar objects,
places, festivals, foods, music, patterns and language are all selected per
**state**, and can be narrowed further per **community**.

A patient profile carries `stateId` (one of `AS AR MN ML MZ NL SK TR`) and an
optional `communityId` (e.g. `meghalaya.khasi`, `assam.bodo`). The backend only
stores and echoes these two fields; the packs themselves are pure data bundled
in the app ([`apps/patient-mobile/src/content/`](apps/patient-mobile/src/content/)),
so they work with no network and a device that has never been online still gets
the right content. A missing `stateId` falls back to the Assam pack, so profiles
created before this feature keep working.

| State | Signature material | Languages (primary first) |
| --- | --- | --- |
| **Assam** | Bihu, gamosa, tea gardens, the Brahmaputra, jaapi, xorai, namghar, Kaziranga | Assamese |
| **Arunachal Pradesh** | Mountains, cane and handloom, the mithun, wild orchids — a neutral common ground across 25+ communities | Nyishi · English |
| **Manipur** | Loktak Lake and phumdi huts, the phanek, black rice, the pena, Shirui lily | Meitei (Manipuri) · English |
| **Meghalaya** | Living root bridges, the knup rain shield, pine hills, Khasi/Garo/Jaintia markets and dress | Khasi · Garo · English |
| **Mizoram** | The puan, cheraw bamboo, jhum fields, passion fruit, church and Christmas at home | Mizo · English |
| **Nagaland** | The morung and log drum, terrace fields, the hornbill, community-specific shawls | Nagamese · English |
| **Sikkim** | Kanchenjunga, cardamom terraces, prayer flags and chortens, Lepcha/Bhutia/Nepali homes | Nepali · English |
| **Tripura** | Bamboo and cane craft, the risa and rignai, Garia puja, queen pineapples, the kham drum | Kokborok · Bengali · English |

Each pack declares `matchObjects` (the "Where Did I Keep It?" pool — object plus
the place it lives), and `places` / `festivals` / `foods` / `music` / `patterns`
reference lists for narration, every entry labelled in English and the local
language. Three signature illustrations per state are added in
[`illustrations.tsx`](apps/patient-mobile/src/games/illustrations.tsx) and listed
in [`illustrationCatalog.ts`](apps/patient-mobile/src/games/illustrationCatalog.ts);
the remaining cards reuse shared shapes. `culturalNotes` on each pack record how
religious and festival material must be handled — monasteries, sacred groves,
the namghar and warrior shawls are named as familiar landmarks, never as
spectacle.

**Adding a community pack.** Add a `ContentPackCommunity` entry and, where the
objects differ, override `matchObjects` for that community inside the state pack
file. Keep every `illustrationId` present in `illustrationCatalog.ts`. The test
[`content/__tests__/contentPacks.test.ts`](apps/patient-mobile/src/content/__tests__/contentPacks.test.ts)
enforces pack shape (enough objects for the largest board, look-alike groups for
the hardest level, every illustration resolvable, both language labels present).

**Languages.** English and Assamese carry the prototype. `mni kha grt lus nag ne
bn trp njz` are registered in `SupportedLanguages`, the Prisma `Language` enum
and the i18n layer, with placeholder locale files
(`locales/<lang>.json`, marked `PLACEHOLDER_PENDING_NATIVE_REVIEW`) whose every
key falls back to English at runtime — so each language is usable now and gains
real strings one single-file review at a time.

**Demo data.** `npm run db:seed` creates Aita (Assam, the full 18-step demo) plus
one lightweight demo patient per state — pairing codes `610001`–`610007` — each
with its `stateId`, community, language and a few memories from that pack.

---

## Security and privacy

**Consent.** Every photograph, voice clip and story is linked to a
`ConsentRecord` carrying its purpose, who granted it, when, its scope, a version
and its status. Withdrawing consent immediately soft-deletes every asset in
scope, removes them from the memories list and from every future offline
package, and bumps the package version so devices refresh — while keeping the
consent record itself for audit. All of this is covered by tests.

**Media.** There is no public URL for any asset. Every link is an HMAC signature
binding the storage key, the patient and an expiry together, so a leaked link
cannot be replayed later or reused for a different patient. File type and size
are validated on upload, checksums are stored, and a crafted key cannot escape
the media root. A missing file returns a clean 404 and the app shows a friendly
card rather than crashing.

**Tokens.** Access tokens carry identity and role only — no medical data, no
schedule content, no memory metadata (asserted by a test). Refresh tokens are
stored as SHA-256 digests, rotate on every use, and replaying a revoked token
revokes the entire family for that user. Device tokens are checked against a
stored hash on every request, so a revoked or rotated device stops working
immediately rather than when the JWT expires; each carries a unique `jti` so
re-pairing genuinely invalidates the previous token. On the device the token
lives in the platform keystore (Expo Secure Store), never in SQLite.

**Access control.** A caregiver or health worker can only reach a patient they
are actively assigned to; a device can only reach the patient it was paired
with, and can only change the accessibility preferences reachable from the
Settings screen. Admin access is permitted and audited.

**Audit.** Logins, pairing, package downloads, schedule and memory changes,
consent grants and withdrawals, and every alert action are recorded with actor,
role, IP, user agent and patient.

**Transport.** Helmet, a CORS allow-list, and rate limiting (tighter on
credential and pairing endpoints) are enabled. **Terminate TLS in front of this
service** — it speaks plain HTTP.

**Clinical safety.** The ML service refuses to emit clinical language:
[`app/safety.py`](services/ml-service/app/safety.py) scans every explanation and
raises rather than returning it. A trend needs multiple sessions *and* multiple
moving indicators before suggesting review, so one poor session can never
generate caregiver noise. The patient app never displays "Wrong", "Failed",
"Poor" or "Game Over".

---

## Troubleshooting

**`Can't reach database server` / `P1001`**
PostgreSQL is not running or `DATABASE_URL` is wrong. Check with
`pg_isready`; with Docker, `docker compose ps postgres`.

**`P1010: User was denied access`**
The database exists but the role cannot use it. Create it with your own user:
`createdb smritisetu`, then set `DATABASE_URL` to match.

**Backend tests fail with a test-database error**
They use `smritisetu_test`, derived from your `DATABASE_URL`. Create it
(`createdb smritisetu_test`) or set `TEST_DATABASE_URL` explicitly.

**Pairing fails with 409 on a second device**
Real pairing codes are single-use. Generate a fresh one:
`POST /api/v1/patients/:patientId/pairing-codes` as a caregiver. The seeded demo
code `123456` is deliberately reusable.

**Pairing fails with 410**
The code expired. Codes issued through the API last 24 hours.

**The app cannot reach the backend from a physical device**
`localhost` on the phone means the phone. Set `EXPO_PUBLIC_API_URL` to your
machine's LAN IP, add that origin to `CORS_ORIGINS`, restart both, and confirm
they are on the same network.

**`Cannot find module 'react-native-worklets/plugin'`**
`npx expo install react-native-worklets` — Reanimated 4 requires it.

**Reminders do not appear**
Notification permission was declined. Grant it in the system settings; the
My Day timeline still shows everything in the meantime.

**No voice**
The device has no speech engine for the selected language. Assamese
text-to-speech is unavailable on most devices, so the nearest available voice is
used. Text is always readable regardless, and the app never depends on audio.

**The ML service is unreachable**
Games keep working and difficulty holds at its current level — this is by design
and is covered by tests. `GET /ready` reports it without marking the API
unready. The patient sees no technical error.

**`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` when running mobile tests**
A test imported a module that pulls in a native package. Keep pure logic free of
Expo imports, or add the module to the stub list in
`apps/patient-mobile/src/testing/tsResolver.mjs`.

---

## Prototype limitations

Stated plainly, because a prototype that hides its gaps is harder to build on.

1. **The regional-language translations need native speakers.** Every string is
   present and the app is fully usable in Assamese, but the strings in
   [`locales/as.json`](apps/patient-mobile/locales/as.json) were prepared for
   this prototype and are marked `PLACEHOLDER_PENDING_NATIVE_REVIEW`. They are
   isolated in that one file so review is a single-file task, and untranslated
   keys fall back to real English sentences rather than showing raw keys. The
   other regional languages (`mni kha grt lus nag ne bn trp njz`, see
   [Regional content packs](#regional-content-packs)) ship as English-fallback
   placeholder files awaiting the same review. The regional content packs' own
   `labelLocal` strings are likewise romanised placeholders pending review.

2. **No recorded voice prompts ship, and no cloned voice ships.** Out of the
   box, voice guidance uses on-device text-to-speech: it works offline but is
   not a warm human voice, and no device ships an Assamese voice, so the nearest
   available one is used. Two routes replace it and neither needs a code change
   — drop real recordings in as `AudioPrompt`s, or record 30–45 seconds once and
   let [`services/tts-service`](services/tts-service/README.md) generate every
   fixed phrase in that voice. The cloned route covers English only, because
   Qwen3-TTS does not speak the North Eastern languages; those keep the device
   voice rather than being mispronounced.

3. **The demo pairing code is reusable.** Real codes are single-use and expire
   in 24 hours. `PairingCode.reusable` is set only by the seeder, only on
   `123456`, so the demo can be replayed. It must never be set for a real
   patient.

4. **No caregiver application.** The backend exposes every endpoint a caregiver
   dashboard needs — alerts, trends, schedules, memory vault, consent — and they
   are documented and tested, but the dashboard itself is not built. Caregiver
   actions are performed through the API.

5. **Media is stored on local disk.** Signed, expiring and access-controlled,
   but a single machine's disk. Production needs S3 or equivalent; the driver
   switch and the credential slots are in place.

6. **Push notifications are logged, not sent.** No FCM credential is needed to
   run the demo. Patient reminders do not depend on push — they are scheduled
   locally — so this affects only caregiver-facing notifications.

7. **Media is not pre-downloaded for offline use.** Photographs are fetched
   through signed URLs and cached by the image layer. The database has
   `local_path` columns and the repositories support them, but a background
   downloader is not implemented, so a device that has never been online will
   show placeholder cards instead of photographs.

8. **The anomaly detector is deliberately conservative.** It needs more than
   twelve baseline sessions, exposes no score, and can only ever *withhold* a
   difficulty increase — never cause one. On a degenerate baseline it falls back
   to a robust z-score, and then to the rule engine alone.

9. **Trends are computed on demand.** There is no scheduled job; a trend is
   analysed when the endpoint is called or a sync completes. Inactivity and
   not-synced alerts have evaluation functions and tests, but no cron to call
   them periodically.

10. **Not clinically validated.** The thresholds — 80% to move up, 50% to move
    down, five sessions and two indicators for a trend — are reasonable
    defaults, not clinically derived. Every one is configurable via environment
    variables and would need validation with clinicians before real use.

11. **Single-patient devices.** One device pairs to one patient. The
    profile-selection screen confirms who is using the app rather than offering
    a list.

12. **Plain HTTP.** TLS termination is expected to be handled by a proxy.

---

## Repository layout

```
smritisetu-ai/
├── apps/
│   └── patient-mobile/          Expo · React Native · TypeScript
│       ├── app/                 Routes (expo-router)
│       ├── src/
│       │   ├── api/             Client, secure storage, error taxonomy
│       │   ├── audio/           Audio-prompt resolution, voice guidance
│       │   ├── components/      Elderly-friendly UI primitives
│       │   ├── content/         Regional content packs (one file per state)
│       │   ├── db/              Adapter, migrations, repositories
│       │   ├── games/           Pure logic, SVG illustrations, illustration catalog
│       │   ├── i18n/            Translation resolution with fallback
│       │   ├── notifications/   State machine, planner, manager
│       │   ├── session/         Pairing, bootstrap, device identity
│       │   ├── store/           Zustand
│       │   ├── sync/            Backoff, engine, event queue
│       │   ├── integration/     End-to-end tests
│       │   └── testing/         Resolver hook and native stubs
│       └── locales/             en.json · as.json · 9 regional-language stubs
├── services/
│   ├── backend-api/             Express · Prisma · PostgreSQL
│   │   ├── prisma/              Schema, migrations, seed
│   │   └── src/
│   │       ├── config/ lib/ middleware/
│   │       ├── modules/         auth, patients, schedules, sync,
│   │       │                    games, memories, alerts, media, health
│   │       ├── services/        offlinePackage, alertEngine,
│   │       │                    adaptation, trends
│   │       ├── docs/            OpenAPI document
│   │       └── tests/           Vitest suites
│   ├── ml-service/              FastAPI
│   │   ├── app/
│   │   │   ├── rules/           adaptation, trends, engagement
│   │   │   ├── models/          anomaly detector
│   │   │   └── safety.py        Output guard rails
│   │   └── tests/
│   └── tts-service/             FastAPI · Qwen3-TTS voice cloning (optional)
│       ├── app/                 Provider, static + dynamic voice, cache
│       ├── scripts/             Reference-voice prep, static generation
│       ├── voices/              Your recording (gitignored)
│       └── tests/
├── packages/
│   └── shared-types/            Contracts and zod schemas
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## Licence

Prototype. **Not for clinical use.**
