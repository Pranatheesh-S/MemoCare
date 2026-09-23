# Custom accessibility voice

The patient app speaks constantly — screen titles, buttons, instructions,
confirmations, warnings, game prompts, reminders and the companion's replies.
By default that is the device's own synthetic voice.

This service replaces it with **one real person's voice**, cloned from a single
short recording with [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS).

```
                   the application
                          │  text to speak
                          ▼
                    Voice Manager
                          │
            ┌─────────────┴──────────────┐
            │                            │
      FIXED NARRATION              CHANGING TEXT
      buttons · screens            companion replies
      instructions · help          personalised reminders
      game prompts · errors        anything with a name in it
            │                            │
     generated once,              generated as needed,
     bundled, offline             cached, swept after 24h
            └─────────────┬──────────────┘
                          ▼
                      Qwen3-TTS
                   + your reference voice
                          ▼
                   your voice, speaking
```

Fixed narration is **not** generated at run time. It is generated once into WAV
files that ship inside the app, so pressing *Back* speaks instantly, with no
model, no network and no delay. Only genuinely changing text reaches the model
while the app is running.

---

## Contents

| | |
| --- | --- |
| [Setup](#setup) | The ten steps, start to finish |
| [How it decides what to play](#how-it-decides-what-to-play) | Resolution order |
| [Regenerating](#regenerating) | After you change your recording |
| [Languages](#languages) | Why Assamese still uses the device voice |
| [API](#api) | Three endpoints |
| [Environment variables](#environment-variables) | Every setting |
| [Testing](#testing) | Commands and what they cover |
| [Hardware](#hardware) | GPU, Apple Silicon, CPU |
| [Failure behaviour](#failure-behaviour) | What happens when things break |
| [Privacy](#privacy) | Where your recording goes, and where it does not |
| [Troubleshooting](#troubleshooting) | Common problems |

---

## Setup

### Step 1 — Record about 30–45 seconds of your voice

One take, one voice, no music and no one else talking. A quiet room with soft
furnishings beats a large echoey one. Phone recordings are fine.

### Step 2 — Say the right kinds of thing

The app needs all of these, so the recording should contain all of these:

- calm instructions — *"Touch a card, then touch where it belongs."*
- questions — *"Would you like to play a memory game?"*
- plain statements — *"Everything is saved on this device."*
- supportive lines — *"You are doing so well. There is no hurry."*

Speak the way the app should sound: **warm, clear, a little slower than usual,
never dramatic and never rushed.** The generated voice inherits your pace and
manner, which is why speech rate is left at 1.0 by default — a calm voice should
come from a calm recording, not from slowing a fast one down afterwards.

You never record the app's own sentences. This one sample becomes the voice; all
186 of the app's fixed phrases are then generated in it.

### Step 3 — Convert it

```bash
cd services/tts-service
python3.12 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

.venv/bin/python scripts/prepare_reference_voice.py \
  --input ~/my-recording.opus \
  --transcribe
```

That converts any phone recording to `voices/my_voice.wav` — mono, 24 kHz,
level-evened, trimmed to 45 seconds — and reports whether it is usable. It needs
`ffmpeg` (`brew install ffmpeg`, or `apt install ffmpeg`).

### Step 4 — Write the transcript

`voices/my_voice.txt` must contain **the exact words you said**. `--transcribe`
drafts it with Whisper if Whisper is installed; read the draft back against the
recording and correct it. The closer it matches, the closer the clone sounds to
you.

Without Whisper, write it by hand — it is 30 seconds of speech.

### Step 5 — Check it is in place

```
voices/
  my_voice.wav     ~30–45 seconds
  my_voice.txt     the exact words
```

By default both are gitignored and stay local. This team has chosen to commit
them to the shared repo instead, so a teammate's `git pull` picks up the same
voice and resumes generation rather than starting over — see `voices/README.md`
if you're forking this for a different team and want the private-by-default
behaviour back.

### Step 6 — Configure

```bash
cp .env.example .env
```

The defaults work. See [environment variables](#environment-variables) for
everything you can change.

### Step 7 — Install Qwen3-TTS

```bash
.venv/bin/pip install -r requirements-model.txt
```

This pulls `torch` and `qwen-tts` — a few gigabytes. Model weights download on
first use. On CUDA you can additionally install FlashAttention:

```bash
.venv/bin/pip install -U flash-attn --no-build-isolation
```

### Step 8 — Generate the app's fixed narration

```bash
.venv/bin/python scripts/generate_static_voiceovers.py --install-to-app
```

The model is loaded **once**, your recording is analysed **once**, and every
fixed phrase in `apps/patient-mobile/locales/en.json` is generated from there.
Progress is printed per phrase; a phrase that fails is reported and the rest
carry on.

`--install-to-app` copies the finished clips into
`apps/patient-mobile/assets/voice/en/` and rewrites
`apps/patient-mobile/src/audio/staticVoiceAssets.ts`, which is what makes
narration instant and available offline.

### Step 9 — Start the service

```bash
.venv/bin/uvicorn app.main:app --port 8100
```

Check it: <http://localhost:8100/tts/health>

```json
{ "enabled": true, "modelLoaded": true, "referenceVoiceLoaded": true, "device": "mps" }
```

### Step 10 — Start the app

```bash
cd ../../apps/patient-mobile
npm start
```

On a physical device, point it at your machine rather than the phone:

```bash
# apps/patient-mobile/.env
EXPO_PUBLIC_TTS_API_URL=http://192.168.1.20:8100
```

---

## How it decides what to play

The app never chooses; [`voiceManager.ts`](../../apps/patient-mobile/src/audio/voiceManager.ts) does:

| | Source | When |
| --- | --- | --- |
| 1 | **Bundled clip in your voice** | Any fixed phrase, once generated. Instant, offline. |
| 2 | **A family member's own recording** | If a caregiver recorded that particular prompt. |
| 3 | **Your voice, generated now** | Only for text that changes: companion replies, sentences with a name, time or count in them. |
| 4 | **The device's speech engine** | Everything else, and any time 1–3 are unavailable. |

A fixed phrase never waits on the network. If no clip was generated for it, it
goes straight to step 4 rather than pausing to ask the service — a button that
takes four seconds to speak is worse than one that speaks in a different voice.

---

## Regenerating

After changing your recording, or editing the app's wording:

```bash
# everything, from scratch — use this after re-recording
.venv/bin/python scripts/generate_static_voiceovers.py --force --install-to-app

# one area only
.venv/bin/python scripts/generate_static_voiceovers.py --category home --install-to-app

# see what would change, generate nothing
.venv/bin/python scripts/generate_static_voiceovers.py --dry-run
```

Without `--force`, a phrase is regenerated only when its clip is missing or its
**words have changed** — the manifest stores a hash of the text, so editing one
sentence in `en.json` regenerates that one clip and nothing else.

Categories: `common`, `onboarding`, `home`, `games`, `reminders`, `memories`,
`help`, `chatbot`, `settings`, `errors`.

`--include-content-packs` additionally generates the regional packs' familiar
object names (*jaapi*, *xorai*, *gamosa* …) — a finite list, better generated
ahead of time than synthesised in the middle of a game.

---

## Languages

Qwen3-TTS speaks Chinese, English, Japanese, Korean, German, French, Russian,
Portuguese, Spanish and Italian.

**Assamese and the other North Eastern languages are not among them.** Asking it
to read Assamese would produce something mispronounced, which for a patient who
speaks only Assamese is worse than a synthetic voice that gets the sounds
roughly right. So:

- **English** narration uses your cloned voice.
- **Assamese and the regional languages** keep the device's own speech engine,
  exactly as before — [`speechLocaleFor`](../../apps/patient-mobile/src/audio/audioPrompts.ts)
  still maps Assamese onto the nearest available Indic voice.

The registry is keyed by language *and* phrase, and there is deliberately no
cross-language fallback: an Assamese screen never speaks English at you.

If a future model does speak these languages, add the code to
`TTS_SUPPORTED_LANGUAGES` and generate with `--language as`. Nothing else changes.

---

## API

Three endpoints, and none of them can name a file.

**`POST /tts/generate`** — speak changing text.

```bash
curl -X POST http://localhost:8100/tts/generate \
  -H 'content-type: application/json' \
  -d '{"text": "Good morning. How can I help you?", "language": "en"}'
```

```json
{
  "success": true,
  "id": "3f2b…",
  "audioUrl": "/tts/audio/3f2b….wav",
  "duration": 4.2,
  "cached": false
}
```

**`GET /tts/audio/{id}`** — the generated clip. The id must be a UUID.

**`GET /tts/health`** — whether the voice is usable. Reports no paths.

Also `GET /tts/manifest?language=en` (which phrases are pre-generated) and
`GET /tts/static/{language}/{file}` (for a client that caches clips rather than
bundling them). Interactive docs at <http://localhost:8100/docs>.

---

## Environment variables

Every one is documented in [`.env.example`](.env.example). The ones that matter:

| Variable | Default | |
| --- | --- | --- |
| `TTS_ENABLED` | `true` | `false` runs the app exactly as it was, with the device voice. Nobody needs the model to work on the rest of the app. |
| `TTS_MODEL` | `Qwen/Qwen3-TTS-12Hz-0.6B-Base` | `…-1.7B-Base` is closer to your voice, and slower. |
| `TTS_DEVICE` | `auto` | CUDA, then Apple Metal, then CPU. No GPU is assumed. |
| `TTS_REFERENCE_AUDIO` | `./voices/my_voice.wav` | Server-side only. |
| `TTS_REFERENCE_TEXT` | `./voices/my_voice.txt` | The exact transcript. |
| `TTS_SUPPORTED_LANGUAGES` | `en` | Languages the cloned voice may speak. |
| `TTS_AUDIO_RETENTION_HOURS` | `24` | Generated clips are swept on this schedule. Static clips never are. |
| `TTS_MAX_TEXT_LENGTH` | `1200` | Longer requests are refused. |
| `TTS_API_KEY` | *(blank)* | Set for anything beyond your own network; set `EXPO_PUBLIC_TTS_API_KEY` to match. |
| `TTS_SPEECH_RATE` | `1.0` | Advice to the player. Rate is applied on playback, never by stretching audio. |

App side, in `apps/patient-mobile/.env`:

| Variable | Default | |
| --- | --- | --- |
| `EXPO_PUBLIC_TTS_API_URL` | port 8100 on the API host | Where this service is. |
| `EXPO_PUBLIC_TTS_ENABLED` | `true` | `false` disables runtime generation only; bundled clips still play. |
| `EXPO_PUBLIC_VOICE_RATE` | `1` | Normal playback speed. |
| `EXPO_PUBLIC_VOICE_RATE_SLOW` | `0.9` | The *Slow* setting in Settings. |

---

## Testing

```bash
# this service — no model, no GPU, no downloads needed
.venv/bin/python -m pytest

# the app's narration rules
cd ../../apps/patient-mobile && npm test
```

The suite covers the reference-voice checks, the registry, chunking, the cache,
retention, path traversal, the API key, and every way generation is allowed to
fail. It runs against a stand-in engine, so it needs nothing downloaded.

---

## Hardware

| | |
| --- | --- |
| **NVIDIA GPU** | Fastest. `bfloat16`, and FlashAttention if installed. |
| **Apple Silicon** | Works on Metal (`mps`) in `float32`. Generating all 186 phrases takes a few minutes. |
| **CPU only** | Works. Slow — perhaps a second or two of compute per second of speech. Generate the static clips once and the app is unaffected; runtime generation for the companion will lag. |

The device chosen is logged at startup and reported by `GET /tts/health`.

---

## Failure behaviour

Nothing here is on the critical path of the patient app.

| If | Then |
| --- | --- |
| The service is not running | Bundled clips still play. Changing text uses the device voice. |
| The reference voice is missing | The service starts, logs exactly which variable is wrong, and reports `modelLoaded: false`. |
| The model cannot load | Same. The app falls back. |
| Generation fails mid-request | `503` with a fallback code; the app speaks with the device voice. |
| One phrase fails during generation | `FAILED: <key>` is printed and the remaining phrases still generate. |
| `TTS_ENABLED=false` | The app behaves exactly as it did before any of this existed. |

Static narration works with no internet at all, which is the point: navigation
and instructions must never depend on a network.

---

## Privacy

- By default, `voices/*.wav`, `voices/*.txt`, `static_audio/` and
  `apps/patient-mobile/assets/voice/` are all gitignored — nobody's voice is
  published just by using this service. **This particular team has chosen to
  commit them anyway**, so a teammate's `git pull` resumes generation instead
  of starting from zero. That is a deliberate, per-team choice in `.gitignore`,
  not the default; revert it if that stops being what you want.
- Regardless of what's committed, the running service never logs the
  recording, never returns it over any endpoint, and never sends it anywhere.
- A client sends text and receives audio. It cannot name a voice, a path or a
  file — `/tts/audio/{id}` accepts only a UUID and `/tts/static/{lang}/{file}`
  only a pattern-checked name, so no request can read outside its directory.
- Generated *dynamic* clips (`generated/`) can contain a patient's name, so
  they stay gitignored and are swept after `TTS_AUDIO_RETENTION_HOURS`
  regardless of the choice above — that exclusion is not up for team override.

---

## Troubleshooting

**`Reference voice file not found at TTS_REFERENCE_AUDIO`**
The path is relative to `services/tts-service`. Run
`scripts/prepare_reference_voice.py` or set the variable to an absolute path.

**`Reference voice must be a WAV file`**
Qwen3-TTS wants a WAV. `scripts/prepare_reference_voice.py --input <your file>`
converts anything ffmpeg can read.

**`Qwen3-TTS is not installed`**
`pip install -r requirements-model.txt`. The API layer deliberately runs without
it so the rest of the app can be worked on without a multi-gigabyte download.

**The generated voice does not sound like me**
Usually the transcript. It must match the recording word for word. After that,
try a cleaner or longer sample, then `TTS_MODEL=Qwen/Qwen3-TTS-12Hz-1.7B-Base`.

**Narration is still the old synthetic voice**
`GET /tts/health` first. If `modelLoaded` is true, you probably have not run
`generate_static_voiceovers.py --install-to-app` — check that
`apps/patient-mobile/src/audio/staticVoiceAssets.ts` is not still empty, and
restart Metro with `npx expo start --clear` so the new assets are bundled.

**Assamese is not in my voice**
Expected — see [Languages](#languages).

**The app cannot reach the service from a physical device**
`localhost` on the phone is the phone. Set `EXPO_PUBLIC_TTS_API_URL` to your
machine's LAN address.

**Generation is very slow**
Check the device at `GET /tts/health`. `cpu` where you expected `cuda:0` or `mps`
means torch was installed without the right backend.
