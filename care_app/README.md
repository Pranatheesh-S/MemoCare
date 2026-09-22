# SmritiSetu Dashboard

Caregiver & healthcare-worker web dashboard for **SmritiSetu AI** (Developer 3). Consumes backend APIs; does not implement backend or the patient mobile app.

## Stack

- Next.js (App Router) + TypeScript (strict)
- Tailwind CSS
- Recharts
- JWT auth against `/auth/login`, `/auth/refresh`, `/devices/pair`

## Quick start

```bash
cd smritisetu-dashboard
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo accounts (mock mode)

| Role              | Email                        | Password   |
| ----------------- | ---------------------------- | ---------- |
| Caregiver         | `riya.caregiver@example.com` | `demo1234` |
| Healthcare worker | `ananya.worker@example.com`  | `demo1234` |

Seed patient: **Aita** (Assamese, Majuli) with routines, sessions, alerts, and a consented memory.

## Environment

| Variable                   | Default                 | Purpose                                      |
| -------------------------- | ----------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_USE_MOCKS`    | `true`                  | Use in-memory mock API matching §6/§7 shapes |
| `NEXT_PUBLIC_API_BASE_URL` | `http://localhost:4000` | Live backend base URL when mocks are off     |

Flip to live:

```env
NEXT_PUBLIC_USE_MOCKS=false
NEXT_PUBLIC_API_BASE_URL=https://your-backend.example
```

API surface is centralized in [`src/lib/api/index.ts`](src/lib/api/index.ts) — swapping mocks for HTTP is a one-file concern.

## Demo rehearsal checklist

1. Sign in as caregiver → open **Aita** overview (sync, games today, adherence, open alerts).
2. Profile → generate pairing code via `POST /devices/pair`.
3. Routines → confirm critical morning medicine; add/pause a routine.
4. Memory Vault → upload with explicit consent checkbox.
5. Trends → 7/30-day charts + non-diagnostic disclaimer.
6. Alert centre → acknowledge, escalate (actor + timestamp), resolve.
7. Sign out → sign in as healthcare worker → assigned patients only.
8. Patient detail → visit note → escalations → period summary export (sourced lines + disclaimer).

## Product rules

- No dementia/risk scores.
- Plain-language observations only; author roles labeled.
- Red/urgent styling reserved for urgent alerts.
- Reminder states are acknowledgements/misses — never “medicine was taken.”

See [CONTRACT_GAPS.md](CONTRACT_GAPS.md) for screen requirements without matching §8.1 endpoints.

## Scripts

- `npm run dev` — development server
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint
