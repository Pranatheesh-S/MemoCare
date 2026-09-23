# SmritiSetu AI — ML Personalisation Service

Explainable, **non-diagnostic** adaptation and trend analysis.

## What it does

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/adaptation/recommend` | Next difficulty and hint level for one activity |
| `POST /v1/trends/analyse` | Rolling 7-day / 30-day engagement observation |
| `POST /v1/engagement/recommend` | Which activity to offer next |
| `POST /v1/personalisation/plan` | One full plan for the next activity — game, item and question counts, preview time, hint level and modality, session length, calm follow-up, familiar content |
| `GET /health` | Liveness, rule-engine version, detector availability |

## What it must never do

It never predicts whether a patient has dementia, never states that a condition
has changed, never comments on medicines, and never uses words like "wrong",
"failed" or "game over". [`app/safety.py`](app/safety.py) scans every
explanation before it is returned; a trip is a 500, never a response.

## Design

**Deterministic rules first** ([`app/rules/adaptation.py`](app/rules/adaptation.py)),
in fixed priority order:

1. two or more recent activities abandoned → keep the level, offer a calmer activity
2. accuracy below 50% across two comparable sessions → one level down
3. hints consistently above the threshold → keep the level, raise hint support
4. accuracy at or above 80% across three comparable sessions → one level up
5. otherwise → maintain

Only sessions of the same activity **at the same difficulty** are compared, so an
easier level can never look like an improvement. Difficulty is clamped to
`[1, 4]` and never moves more than one level at a time — enforced in the rule
engine, again in `safety.clamp_step`, and once more in the backend.

**Trends** ([`app/rules/trends.py`](app/rules/trends.py)) use medians, not means,
so one bad day cannot swing a result. `REVIEW_SUGGESTED` requires at least
`ML_TREND_MIN_SESSIONS` sessions **and** `ML_TREND_MIN_INDICATORS` moving
indicators. Memory Lane is excluded from every scored indicator.

**Session planner** ([`app/personalisation/`](app/personalisation/)) turns a
patient's own session history into a single comfortable plan for the next
activity. [`signals.py`](app/personalisation/signals.py) derives the
observations — accuracy and response-time trends, hints, repeated difficulty,
session duration, abandonment rate, the time of day the patient does best,
preferred activities, a fatigue signal and whether the recent session was
unusual. [`planner.py`](app/personalisation/planner.py) then:

1. asks the deterministic rule engine for the **difficulty ceiling and hint
   floor** (the same call and anomaly hold as `/v1/adaptation/recommend`);
2. builds a complete rule-based plan inside those bounds — comfort first, so an
   eligible step up is **withheld** whenever the signals show fatigue, repeated
   difficulty, recent abandonment or an unusual session (an eight-card game
   becomes a four-card game with longer preview, familiar content, a spoken hint
   and a calm follow-up);
3. optionally lets **Gemini** ([`gemini.py`](app/personalisation/gemini.py))
   refine the tunable fields. Gemini can only *soften* the plan: never raise
   difficulty above the ceiling, never drop hint support below the floor, never
   switch off a calm follow-up when the signals are concerning. Every string it
   returns is re-checked by [`app/safety.py`](app/safety.py), every number is
   re-clamped, and `difficulty` still moves at most one level.

If `GEMINI_API_KEY` is unset, `ML_GEMINI_ENABLED=false`, the request carries
`use_gemini: false`, or the call fails or times out, step 3 is skipped and the
rule-based plan ships unchanged with `source: "baseline"`. The planner needs no
extra dependency — it calls the REST API with the standard library — so the
service still imports and runs fully offline. See
[`.env.example`](.env.example) for the `ML_GEMINI_*` settings.

**Anomaly detection** ([`app/models/anomaly.py`](app/models/anomaly.py)) is
optional and secondary. It needs a baseline of more than `ML_ANOMALY_MIN_BASELINE`
sessions, exposes no score, and can only ever *withhold* a difficulty increase —
never cause one. If scikit-learn is unavailable or the baseline is degenerate it
falls back to a robust MAD z-score, and if that is unavailable too the rule
engine decides alone.

## Run

```bash
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

Interactive docs: <http://localhost:8000/docs>

## Test

```bash
.venv/bin/python -m pytest -q
```

## On-device TFLite trainer

The patient app runs a tiny 5→16→8→3 network offline. Train and export it with Python 3.12 (TensorFlow has no 3.14 wheels yet):

```bash
python3.12 -m venv .venv-train && source .venv-train/bin/activate
pip install -r requirements-train.txt
python train_adaptation_model.py
```

That writes `models/adaptation_model.tflite` and copies it to `apps/patient-mobile/assets/models/`. Until real session logs replace the synthetic teacher, the network mimics the same caregiver weights as the rule fallback in `AdaptationEngine`.
