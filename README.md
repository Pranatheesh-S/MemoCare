# MemoCare

**MemoCare** (project codename *SmritiSetu AI* — "Bridge to Memories") is an
offline-first cognitive-gaming and memory-assistance platform for elderly
dementia patients, built for Smart India Hackathon 2026.

The repo brings together the three pieces of the system:

| Folder | What it is |
| --- | --- |
| [`smritisetu-ai/`](smritisetu-ai/) | Main monorepo — patient mobile app (Expo/React Native), backend API (Node/Express/Prisma), ML personalisation service (Python/FastAPI), and TTS service |
| [`care_app/`](care_app/) | Caregiver & healthcare-worker web dashboard (Next.js) that consumes the backend APIs, plus the `care-mobile` companion app |
| [`TAI-dementia-model/`](TAI-dementia-model/) | Standalone voice-interaction backend — ASR (Whisper) + Gemini conversation engine, analytics and dashboard modules |

See [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) and
[`IMPLEMENTATION_CHECKLIST.md`](IMPLEMENTATION_CHECKLIST.md) for the original
architecture notes, and [`SmritiSetu_AI_Complete_Architecture.docx`](SmritiSetu_AI_Complete_Architecture.docx)
for the full design document.

> This is a support tool, not a diagnostic platform. It never diagnoses
> dementia, never recommends or changes medicines, and never claims a
> patient's condition has worsened.

## Quick start

Each sub-project has its own README with setup instructions:

- [`smritisetu-ai/README.md`](smritisetu-ai/README.md)
- [`care_app/README.md`](care_app/README.md)
- [`TAI-dementia-model/README.md`](TAI-dementia-model/README.md)
