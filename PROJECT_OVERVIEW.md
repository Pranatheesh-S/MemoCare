# SIH-2026 — SmritiSetu AI

**SmritiSetu AI** — *Bridge to Memories* — an offline-first cognitive gaming and
memory-assistance platform for elderly dementia patients in the North Eastern
Region of India.

The full project lives in **[`smritisetu-ai/`](smritisetu-ai/)**.

👉 **[Read the documentation](smritisetu-ai/README.md)** — setup, architecture,
API reference, the demo walkthrough, security notes and known limitations.

## At a glance

| | |
| --- | --- |
| **Patient app** | Expo · React Native · TypeScript · SQLite · offline-first |
| **Backend** | Node · Express · Prisma · PostgreSQL · JWT · Swagger |
| **ML service** | Python · FastAPI · explainable, non-diagnostic personalisation |
| **Tests** | 432 passing — 126 backend · 108 ML · 188 mobile · 10 end-to-end |
| **Demo pairing code** | `123456` |

> SmritiSetu AI is a support tool, not a diagnostic platform. It never diagnoses
> dementia, never recommends or changes medicines, and never claims a patient's
> condition has worsened.

## Run it

```bash
cd smritisetu-ai
cp .env.example .env
docker compose up --build
docker compose exec backend-api npx tsx prisma/seed.ts

# then, in apps/patient-mobile:
npm start
```

See [`smritisetu-ai/README.md`](smritisetu-ai/README.md) for the Docker-free
path and everything else.
