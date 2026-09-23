"""
Compose one comfortable plan for the next activity.

Order of operations, and every step is a safety step:

1. Derive the patient's own signals (`signals.derive_signals`).
2. Ask the deterministic rule engine for the difficulty ceiling and hint floor
   (`rules.adaptation` + the same anomaly hold used by `/v1/adaptation/recommend`).
3. Build a fully-formed rule-based plan from those bounds and the signals.
4. Optionally let Gemini refine the *tunable* fields — it can only soften the
   plan: never raise difficulty above the ceiling, never drop hint support below
   the floor, never turn off a calmer follow-up when the signals are concerning.
5. Clamp every field and re-check every string with `safety.assert_safe_text`.

If Gemini is disabled, unconfigured, or fails, step 4 is skipped and the
rule-based plan ships unchanged.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from ..config import PERSONALISATION_ENGINE_VERSION, settings
from ..models import anomaly
from ..rules import adaptation, engagement
from ..safety import (
    UnsafeOutputError,
    assert_safe_text,
    clamp_hint_level,
    clamp_step,
    is_safe_text,
)
from ..schemas import (
    AdaptationRequest,
    EngagementRequest,
    PatientSignals,
    PersonalisationRequest,
    SessionPlan,
)
from . import gemini
from .signals import derive_signals

logger = logging.getLogger(__name__)

CALM_GAME_TYPE = "MEMORY_LANE"

# Bounds for the on-screen counts. Independent of the 1-4 difficulty band: a
# struggling patient can be given far fewer items without the difficulty itself
# moving more than one step.
ITEM_BOUNDS: dict[str, tuple[int, int]] = {
    "MEMORY_MATCH": (4, 12),  # cards on the board
    "MARKET_MEMORY": (3, 7),  # items on the shopping list
    "WHO_IS_THIS": (2, 4),  # answer choices per round
    "ROUTINE_BUILDER": (3, 6),  # steps to put in order
}
QUESTION_BOUNDS: dict[str, tuple[int, int]] = {
    "MEMORY_MATCH": (2, 6),  # pairs to find
    "MARKET_MEMORY": (3, 7),  # items to remember
    "WHO_IS_THIS": (2, 4),  # rounds
    "ROUTINE_BUILDER": (1, 2),  # routines
}
PREVIEW_BOUNDS = (0, 12)

# Rule-engine outcomes that mean "lean on support, not challenge".
SUPPORT_REASON_CODES = {
    "ABANDONMENT_SUPPORT",
    "ACCURACY_BELOW_THRESHOLD",
    "AT_MINIMUM_ADDED_SUPPORT",
    "HINT_SUPPORT_INCREASED",
    "HOLD_UNUSUAL_RECENT_SESSION",
}


def _clamp(value: int, low: int, high: int) -> int:
    try:
        v = int(round(float(value)))
    except (TypeError, ValueError):
        v = low
    return max(low, min(high, v))


def _safe(text: str, fallback: str) -> str:
    try:
        return assert_safe_text(str(text).strip() or fallback)
    except UnsafeOutputError:
        logger.warning("A generated plan explanation tripped the safety guard; using the rule text.")
        return fallback


def _safe_baseline(request: PersonalisationRequest):
    """The `/v1/adaptation/recommend` decision, anomaly hold included."""
    decision = adaptation.recommend(
        AdaptationRequest(
            patient_id=request.patient_id,
            game_type=request.game_type,
            current_difficulty=request.current_difficulty,
            sessions=request.sessions,
        )
    )
    signal = anomaly.detect(request.sessions)
    if (
        signal.available
        and signal.is_unusual
        and decision.recommended_difficulty > request.current_difficulty
    ):
        return decision.model_copy(
            update={
                "recommended_difficulty": request.current_difficulty,
                "reason_code": "HOLD_UNUSUAL_RECENT_SESSION",
            }
        )
    return decision


def _engagement_pick(request: PersonalisationRequest, fallback: str) -> str:
    try:
        pick = engagement.recommend(
            EngagementRequest(patient_id=request.patient_id, sessions=request.sessions)
        ).recommended_game_type
    except Exception:  # noqa: BLE001 — engagement is a suggestion, never load-bearing
        pick = fallback
    if pick in request.enabled_game_types:
        return pick
    if fallback in request.enabled_game_types:
        return fallback
    return request.enabled_game_types[0] if request.enabled_game_types else fallback


def _default_counts(game_type: str, difficulty: int) -> tuple[int, int, int]:
    """(item_count, question_count, preview_seconds) before any comfort softening."""
    if game_type == "MEMORY_MATCH":
        items = _clamp(2 + 2 * difficulty, *ITEM_BOUNDS["MEMORY_MATCH"])
        return items, _clamp(items // 2, *QUESTION_BOUNDS["MEMORY_MATCH"]), _clamp(12 - 2 * difficulty, *PREVIEW_BOUNDS)
    if game_type == "MARKET_MEMORY":
        items = _clamp(2 + difficulty, *ITEM_BOUNDS["MARKET_MEMORY"])
        return items, items, _clamp(10 - 2 * difficulty, *PREVIEW_BOUNDS)
    if game_type == "WHO_IS_THIS":
        return (
            _clamp(1 + difficulty, *ITEM_BOUNDS["WHO_IS_THIS"]),
            _clamp(1 + difficulty, *QUESTION_BOUNDS["WHO_IS_THIS"]),
            0,
        )
    if game_type == "ROUTINE_BUILDER":
        return (
            _clamp(2 + difficulty, *ITEM_BOUNDS["ROUTINE_BUILDER"]),
            1,
            0,
        )
    return 0, 1, 0


def _calm_plan(request: PersonalisationRequest, sig: PatientSignals) -> SessionPlan:
    explanation = _safe(
        "Memory Lane is a calm reminiscence activity and is not scored, so it stays gentle "
        "and unhurried, with familiar pictures and a spoken voice to listen to.",
        "Memory Lane is a calm reminiscence activity and is not scored.",
    )
    return SessionPlan(
        recommended_game_type=CALM_GAME_TYPE,
        difficulty=clamp_step(request.current_difficulty, request.current_difficulty),
        item_count=0,
        question_count=1,
        preview_seconds=0,
        hint_level=1,
        hint_modality="BOTH",
        session_length="SHORT" if sig.fatigue_likely else "STANDARD",
        end_with_calm_activity=False,
        content_preference="FAMILIAR",
        best_time_of_day=sig.best_time_of_day,
        comfort_first=True,
        reason_code="UNSCORED_CALM_ACTIVITY",
        explanation=explanation,
        confidence=0.6,
        source="baseline",
        signals=sig,
        model_version=PERSONALISATION_ENGINE_VERSION,
    )


def _rule_based_plan(request: PersonalisationRequest, sig: PatientSignals) -> SessionPlan:
    game_type = request.game_type
    current = clamp_step(request.current_difficulty, request.current_difficulty)
    baseline = _safe_baseline(request)

    concerning = (
        sig.fatigue_likely
        or sig.repeated_difficulty
        or (sig.abandoned_recent_rate is not None and sig.abandoned_recent_rate >= settings.trend_abandonment_rate)
        or (sig.deviation_from_baseline.available and sig.deviation_from_baseline.is_unusual)
        or baseline.reason_code in SUPPORT_REASON_CODES
    )

    # The rules may raise a level; comfort wins when the signals are concerning.
    difficulty = clamp_step(current, baseline.recommended_difficulty)
    step_up_withheld = False
    if concerning and difficulty > current:
        difficulty = current
        step_up_withheld = True

    hint_floor = clamp_hint_level(baseline.hint_level)
    items, questions, preview = _default_counts(game_type, difficulty)
    hint_level = hint_floor
    hint_modality = "VISUAL"
    session_length = "STANDARD"
    content_preference = "STANDARD"
    end_with_calm = False

    if concerning:
        low, _high = ITEM_BOUNDS.get(game_type, (items, items))
        # Repeated difficulty or fatigue: take it right down to the gentlest
        # board (an eight-card game becomes a four-card game). Otherwise ease off.
        items = low if (sig.repeated_difficulty or sig.fatigue_likely) else _clamp(items - 2, low, items)
        q_low, _q_high = QUESTION_BOUNDS.get(game_type, (questions, questions))
        questions = _clamp(questions - 1, q_low, questions)
        preview = _clamp(preview + 3, *PREVIEW_BOUNDS) if game_type in ("MEMORY_MATCH", "MARKET_MEMORY") else preview
        hint_level = clamp_hint_level(max(hint_floor, hint_floor + 1))
        hint_modality = "BOTH"
        content_preference = "FAMILIAR"
        end_with_calm = True

    if sig.fatigue_likely:
        session_length = "SHORT"
        questions = QUESTION_BOUNDS.get(game_type, (questions, questions))[0]

    if sig.familiar_content_recommended:
        content_preference = "FAMILIAR"

    if game_type == "MEMORY_MATCH" and questions * 2 < items:
        # Keep the board and the pair target consistent for a matching game.
        items = _clamp(questions * 2, *ITEM_BOUNDS["MEMORY_MATCH"])

    comfort_first = concerning or step_up_withheld

    if game_type not in ITEM_BOUNDS:
        reason_code = "UNSUPPORTED_ACTIVITY"
    elif sig.scored_session_count < 3:
        reason_code = "LIMITED_HISTORY"
    elif sig.fatigue_likely:
        reason_code = "SHORTENED_FOR_FATIGUE"
    elif concerning:
        reason_code = "GENTLER_SET"
    elif difficulty > current:
        reason_code = "STEP_UP_READY"
    else:
        reason_code = "STEADY_PLAN"

    explanation = _safe(_rule_explanation(reason_code, difficulty, items, sig), _FALLBACK_EXPLANATION)

    confidence = 0.55
    if sig.scored_session_count < 3:
        confidence = 0.4
    elif comfort_first:
        confidence = 0.7
    elif difficulty != current:
        confidence = 0.75

    return SessionPlan(
        recommended_game_type=_engagement_pick(request, game_type),
        difficulty=difficulty,
        item_count=items,
        question_count=questions,
        preview_seconds=preview,
        hint_level=clamp_hint_level(hint_level),
        hint_modality=hint_modality,  # type: ignore[arg-type]
        session_length=session_length,  # type: ignore[arg-type]
        end_with_calm_activity=end_with_calm,
        content_preference=content_preference,  # type: ignore[arg-type]
        best_time_of_day=sig.best_time_of_day,
        comfort_first=comfort_first,
        reason_code=reason_code,
        explanation=explanation,
        confidence=round(confidence, 2),
        source="baseline",
        signals=sig,
        model_version=PERSONALISATION_ENGINE_VERSION,
    )


_FALLBACK_EXPLANATION = (
    "The next round keeps the current level with familiar pacing and support kept comfortable."
)


def _rule_explanation(reason_code: str, difficulty: int, items: int, sig: PatientSignals) -> str:
    if reason_code == "LIMITED_HISTORY":
        return (
            f"Only {sig.scored_session_count} scored activities have been recorded so far, so the next "
            "round stays close to the current level with extra time and support."
        )
    if reason_code == "SHORTENED_FOR_FATIGUE":
        return (
            "There have already been several activities recently, so the next one is shorter and "
            "gentler, with familiar pictures and a spoken hint, and ends with a calm activity."
        )
    if reason_code == "GENTLER_SET":
        return (
            f"Recent activities have been effortful, so the next round has fewer items ({items}), more "
            "time to look, familiar family and household pictures and a spoken hint, and finishes with "
            "a calm activity to end on a good note."
        )
    if reason_code == "STEP_UP_READY":
        return (
            f"Recent rounds have gone smoothly and comfortably, so the next round steps up gently to "
            f"level {difficulty}."
        )
    if reason_code == "UNSUPPORTED_ACTIVITY":
        return _FALLBACK_EXPLANATION
    return (
        "Recent rounds sit comfortably, so the next round keeps the current level with familiar "
        "pacing and a spoken hint available."
    )


def _apply_gemini(
    plan: SessionPlan,
    refined: dict,
    *,
    request: PersonalisationRequest,
    current: int,
    ceiling: int,
    hint_floor: int,
    concerning: bool,
    fatigue_likely: bool,
) -> SessionPlan:
    game_type = request.game_type
    item_bounds = ITEM_BOUNDS.get(game_type)
    question_bounds = QUESTION_BOUNDS.get(game_type)
    if item_bounds is None or question_bounds is None:
        return plan  # unsupported activity — nothing safe to tune

    # Difficulty: Gemini may only soften. Never above the rule ceiling, never
    # more than one step, never out of range.
    g_difficulty = refined.get("difficulty", plan.difficulty)
    difficulty = clamp_step(current, min(_clamp(g_difficulty, settings.min_difficulty, settings.max_difficulty), ceiling))

    hint_level = clamp_hint_level(max(hint_floor, _clamp(refined.get("hint_level", plan.hint_level), 1, settings.max_hint_level)))

    item_count = _clamp(refined.get("item_count", plan.item_count), *item_bounds)
    question_count = _clamp(refined.get("question_count", plan.question_count), *question_bounds)
    preview_seconds = _clamp(refined.get("preview_seconds", plan.preview_seconds), *PREVIEW_BOUNDS)
    if game_type == "MEMORY_MATCH" and question_count * 2 < item_count:
        item_count = _clamp(question_count * 2, *item_bounds)

    modality = refined.get("hint_modality")
    hint_modality = modality if modality in ("VISUAL", "VOICE", "BOTH") else plan.hint_modality

    length = refined.get("session_length")
    session_length = length if length in ("SHORT", "STANDARD") else plan.session_length
    if fatigue_likely:
        session_length = "SHORT"

    content = refined.get("content_preference")
    content_preference = content if content in ("FAMILIAR", "STANDARD") else plan.content_preference
    if concerning:
        content_preference = "FAMILIAR"

    end_with_calm = bool(refined.get("end_with_calm_activity", plan.end_with_calm_activity))
    if concerning:
        end_with_calm = True

    game = refined.get("recommended_game_type")
    recommended_game_type = game if game in request.enabled_game_types else plan.recommended_game_type

    explanation = _safe(refined.get("explanation", plan.explanation), plan.explanation)

    comfort_first = plan.comfort_first or difficulty < plan.difficulty

    return plan.model_copy(
        update={
            "recommended_game_type": recommended_game_type,
            "difficulty": difficulty,
            "item_count": item_count,
            "question_count": question_count,
            "preview_seconds": preview_seconds,
            "hint_level": hint_level,
            "hint_modality": hint_modality,
            "session_length": session_length,
            "end_with_calm_activity": end_with_calm,
            "content_preference": content_preference,
            "comfort_first": comfort_first,
            "explanation": explanation,
            "confidence": round(min(0.85, plan.confidence + 0.05), 2),
            "source": "model",
            "model_version": f"{PERSONALISATION_ENGINE_VERSION}+{gemini.PLANNER_VERSION}",
        }
    )


def plan_session(request: PersonalisationRequest, *, now: datetime | None = None) -> SessionPlan:
    now = now or datetime.now(timezone.utc)
    sig = derive_signals(request.sessions, now=now)

    if request.game_type == CALM_GAME_TYPE:
        return _calm_plan(request, sig)

    plan = _rule_based_plan(request, sig)

    use_gemini = request.use_gemini and settings.gemini_ready
    if not use_gemini:
        return _guarded(plan)

    baseline = _safe_baseline(request)
    current = clamp_step(request.current_difficulty, request.current_difficulty)
    concerning = plan.comfort_first
    payload = {
        "activity_under_consideration": request.game_type,
        "current_difficulty": current,
        "difficulty_ceiling": plan.difficulty,
        "hint_floor": plan.hint_level,
        "enabled_game_types": request.enabled_game_types,
        "locale": request.locale,
        "signals_are_concerning": concerning,
        "signals": sig.model_dump(),
        "baseline_plan": {
            "recommended_game_type": plan.recommended_game_type,
            "difficulty": plan.difficulty,
            "item_count": plan.item_count,
            "question_count": plan.question_count,
            "preview_seconds": plan.preview_seconds,
            "hint_level": plan.hint_level,
            "hint_modality": plan.hint_modality,
            "session_length": plan.session_length,
            "end_with_calm_activity": plan.end_with_calm_activity,
            "content_preference": plan.content_preference,
        },
        "baseline_reason_code": baseline.reason_code,
    }

    try:
        refined = gemini.refine_plan(payload)
    except Exception as error:  # noqa: BLE001 — any planner failure must degrade to rules
        logger.warning("Gemini planner raised, using the rule-based plan: %s", error)
        refined = None

    if not refined:
        return _guarded(plan)

    merged = _apply_gemini(
        plan,
        refined,
        request=request,
        current=current,
        ceiling=plan.difficulty,
        hint_floor=plan.hint_level,
        concerning=concerning,
        fatigue_likely=sig.fatigue_likely,
    )
    return _guarded(merged)


def _guarded(plan: SessionPlan) -> SessionPlan:
    """Last-line defence: the explanation must be safe and difficulty in range."""
    if not is_safe_text(plan.explanation):
        plan = plan.model_copy(update={"explanation": _FALLBACK_EXPLANATION})
    difficulty = max(settings.min_difficulty, min(settings.max_difficulty, plan.difficulty))
    if difficulty != plan.difficulty:
        plan = plan.model_copy(update={"difficulty": difficulty})
    return plan
