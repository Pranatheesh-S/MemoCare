"""
Rolling trend analysis over 7-day and 30-day windows.

Design constraints, all of them safety constraints:
  * robust statistics only (median, not mean) so one bad day cannot swing a result
  * a minimum number of sessions before any observation is produced
  * more than one indicator must move before "review suggested" is returned
  * output is a suggestion to a caregiver, never a statement about a condition
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

from ..config import TREND_ENGINE_VERSION, settings
from ..safety import assert_safe_text
from ..schemas import (
    ReminderAdherence,
    SessionMetric,
    TrendIndicator,
    TrendRequest,
    TrendResponse,
)

# Explanations are assembled from these fragments so wording stays consistent
# and reviewable.
REASON_TEXT = {
    "SUSTAINED_HINT_INCREASE": "required more hints",
    "SUSTAINED_ACCURACY_CHANGE": "answered fewer items correctly",
    "SUSTAINED_RESPONSE_TIME_INCREASE": "took longer to respond",
    "SUSTAINED_ABANDONMENT": "left activities before finishing",
    "REMINDER_ADHERENCE_CHANGE": "marked fewer reminders as done",
}


def _scored(sessions: list[SessionMetric]) -> list[SessionMetric]:
    """Memory Lane is never scored, so it is excluded from every indicator."""
    return [s for s in sessions if s.game_type != "MEMORY_LANE"]


def _median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def _direction(current: float | None, baseline: float | None, tolerance: float) -> str:
    if current is None or baseline is None:
        return "UNKNOWN"
    delta = current - baseline
    if abs(delta) <= tolerance:
        return "STABLE"
    return "UP" if delta > 0 else "DOWN"


def analyse(request: TrendRequest, now: datetime | None = None) -> TrendResponse:
    now = now or datetime.now(timezone.utc)
    days = 7 if request.period == "7d" else 30
    window_start = now - timedelta(days=days)
    baseline_start = window_start - timedelta(days=days)

    scored = _scored(request.sessions)
    current = [s for s in scored if s.played_at >= window_start]
    baseline = [s for s in scored if baseline_start <= s.played_at < window_start]

    indicators: list[TrendIndicator] = []
    triggered: list[str] = []

    # --- participation ---------------------------------------------------
    all_sessions_current = [s for s in request.sessions if s.played_at >= window_start]
    all_sessions_baseline = [s for s in request.sessions if baseline_start <= s.played_at < window_start]
    indicators.append(
        TrendIndicator(
            name="sessions_per_period",
            current=float(len(all_sessions_current)),
            baseline=float(len(all_sessions_baseline)) if all_sessions_baseline else None,
            direction=_direction(
                float(len(all_sessions_current)),
                float(len(all_sessions_baseline)) if all_sessions_baseline else None,
                tolerance=max(1.0, len(all_sessions_baseline) * 0.25),
            ),
            sample_size=len(all_sessions_current),
        )
    )

    if len(current) < settings.trend_min_sessions:
        return TrendResponse(
            status="INSUFFICIENT_DATA",
            reason_code="NOT_ENOUGH_SESSIONS",
            explanation=assert_safe_text(
                f"Only {len(current)} comparable sessions were recorded in the last {days} days. "
                f"At least {settings.trend_min_sessions} are needed before any trend is reported."
            ),
            indicators=indicators,
            session_count=len(current),
            model_version=TREND_ENGINE_VERSION,
        )

    # --- accuracy --------------------------------------------------------
    current_acc = _median([s.accuracy for s in current if s.accuracy is not None])
    baseline_acc = _median([s.accuracy for s in baseline if s.accuracy is not None])
    indicators.append(
        TrendIndicator(
            name="median_accuracy",
            current=_round(current_acc),
            baseline=_round(baseline_acc),
            direction=_direction(current_acc, baseline_acc, tolerance=0.05),
            sample_size=len([s for s in current if s.accuracy is not None]),
        )
    )
    if (
        current_acc is not None
        and baseline_acc is not None
        and baseline_acc - current_acc >= settings.trend_accuracy_drop
    ):
        triggered.append("SUSTAINED_ACCURACY_CHANGE")

    # --- hints -----------------------------------------------------------
    current_hints = _median([float(s.hints_used) for s in current])
    baseline_hints = _median([float(s.hints_used) for s in baseline])
    indicators.append(
        TrendIndicator(
            name="hints_per_session",
            current=_round(current_hints),
            baseline=_round(baseline_hints),
            direction=_direction(current_hints, baseline_hints, tolerance=0.5),
            sample_size=len(current),
        )
    )
    if (
        current_hints is not None
        and baseline_hints is not None
        and current_hints - baseline_hints >= settings.trend_hint_increase
    ):
        triggered.append("SUSTAINED_HINT_INCREASE")

    # --- response time ---------------------------------------------------
    current_rt = _median([s.response_time_seconds for s in current if s.response_time_seconds > 0])
    baseline_rt = _median([s.response_time_seconds for s in baseline if s.response_time_seconds > 0])
    indicators.append(
        TrendIndicator(
            name="median_response_time_seconds",
            current=_round(current_rt),
            baseline=_round(baseline_rt),
            direction=_direction(current_rt, baseline_rt, tolerance=1.0),
            sample_size=len(current),
        )
    )
    if (
        current_rt is not None
        and baseline_rt is not None
        and baseline_rt > 0
        and (current_rt - baseline_rt) / baseline_rt >= settings.trend_response_increase
    ):
        triggered.append("SUSTAINED_RESPONSE_TIME_INCREASE")

    # --- abandonment -----------------------------------------------------
    current_abandon = (
        sum(1 for s in all_sessions_current if s.abandoned) / len(all_sessions_current)
        if all_sessions_current
        else None
    )
    baseline_abandon = (
        sum(1 for s in all_sessions_baseline if s.abandoned) / len(all_sessions_baseline)
        if all_sessions_baseline
        else None
    )
    indicators.append(
        TrendIndicator(
            name="abandonment_rate",
            current=_round(current_abandon),
            baseline=_round(baseline_abandon),
            direction=_direction(current_abandon, baseline_abandon, tolerance=0.1),
            sample_size=len(all_sessions_current),
        )
    )
    if current_abandon is not None and current_abandon >= settings.trend_abandonment_rate:
        triggered.append("SUSTAINED_ABANDONMENT")

    # --- engagement duration (reported, never a trigger on its own) -------
    indicators.append(
        TrendIndicator(
            name="median_engagement_seconds",
            current=_round(_median([float(s.engagement_duration_seconds) for s in all_sessions_current])),
            baseline=_round(_median([float(s.engagement_duration_seconds) for s in all_sessions_baseline])),
            direction=_direction(
                _median([float(s.engagement_duration_seconds) for s in all_sessions_current]),
                _median([float(s.engagement_duration_seconds) for s in all_sessions_baseline]),
                tolerance=30.0,
            ),
            sample_size=len(all_sessions_current),
        )
    )

    # --- reminder adherence ----------------------------------------------
    adherence_rate = _adherence_rate(request.reminder_adherence)
    if adherence_rate is not None:
        indicators.append(
            TrendIndicator(
                name="reminder_adherence_rate",
                current=_round(adherence_rate),
                baseline=None,
                direction="UNKNOWN",
                sample_size=(request.reminder_adherence.acknowledged + request.reminder_adherence.missed)
                if request.reminder_adherence
                else 0,
            )
        )
        if adherence_rate <= (1 - settings.trend_adherence_drop):
            triggered.append("REMINDER_ADHERENCE_CHANGE")

    # --- verdict ---------------------------------------------------------
    # More than one indicator must move before anything is suggested, so a
    # single soft signal cannot generate caregiver noise.
    if len(triggered) >= settings.trend_min_indicators:
        primary = triggered[0]
        others = [REASON_TEXT.get(t, t) for t in triggered[1:]]
        detail = REASON_TEXT.get(primary, primary)
        also = f" The patient also {', '.join(others)}." if others else ""
        return TrendResponse(
            status="REVIEW_SUGGESTED",
            reason_code=primary,
            explanation=assert_safe_text(
                f"Across the last {days} days ({len(current)} comparable sessions) the patient "
                f"{detail} compared with the previous {days} days.{also} "
                "Caregiver review is suggested. This is not a diagnosis."
            ),
            indicators=indicators,
            session_count=len(current),
            model_version=TREND_ENGINE_VERSION,
        )

    if triggered:
        return TrendResponse(
            status="STABLE",
            reason_code="SINGLE_INDICATOR_ONLY",
            explanation=assert_safe_text(
                f"One indicator moved over the last {days} days but the others stayed steady, "
                "so no review is suggested yet. Activity continues to be recorded."
            ),
            indicators=indicators,
            session_count=len(current),
            model_version=TREND_ENGINE_VERSION,
        )

    return TrendResponse(
        status="STABLE",
        reason_code="NO_SUSTAINED_CHANGE",
        explanation=assert_safe_text(
            f"Participation and results over the last {days} days ({len(current)} comparable sessions) "
            "are in line with the previous period."
        ),
        indicators=indicators,
        session_count=len(current),
        model_version=TREND_ENGINE_VERSION,
    )


def _adherence_rate(adherence: ReminderAdherence | None) -> float | None:
    if adherence is None:
        return None
    total = adherence.acknowledged + adherence.missed
    if total == 0:
        return None
    return adherence.acknowledged / total


def _round(value: float | None) -> float | None:
    return None if value is None else round(float(value), 3)
