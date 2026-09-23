"""
Derive the personalisation signals from a patient's session history.

Pure functions only: given a list of `SessionMetric`, produce a `PatientSignals`.
Nothing here talks to a model or the network, so the deterministic planner and
the tests can use it directly. Every number is computed from this patient's own
history and is never compared against another patient.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

from ..config import settings
from ..models import anomaly
from ..schemas import (
    DeviationSignal,
    PatientSignals,
    SessionMetric,
    TimeOfDayBucket,
    TimeOfDayPreference,
)

SCORED_GAME_TYPES = ("MEMORY_MATCH", "MARKET_MEMORY", "WHO_IS_THIS", "ROUTINE_BUILDER")
CALM_GAME_TYPE = "MEMORY_LANE"

# Local-clock buckets. `played_at` is stored in UTC; for the North-East India
# deployment that is +5:30, so we shift before bucketing.
DEFAULT_UTC_OFFSET_MINUTES = 330
_BUCKET_MIN_SESSIONS = 3


def _median(values: list[float]) -> float | None:
    return round(statistics.median(values), 3) if values else None


def _scored(sessions: list[SessionMetric]) -> list[SessionMetric]:
    return [s for s in sessions if s.game_type != CALM_GAME_TYPE]


def _newest_first(sessions: list[SessionMetric]) -> list[SessionMetric]:
    return sorted(sessions, key=lambda s: s.played_at, reverse=True)


def _bucket_for(moment: datetime, offset_minutes: int) -> str:
    local_hour = (moment + timedelta(minutes=offset_minutes)).hour
    if 5 <= local_hour < 12:
        return "MORNING"
    if 12 <= local_hour < 17:
        return "AFTERNOON"
    if 17 <= local_hour < 22:
        return "EVENING"
    return "NIGHT"


def _time_of_day(
    scored: list[SessionMetric], offset_minutes: int
) -> tuple[TimeOfDayPreference, list[TimeOfDayBucket]]:
    grouped: dict[str, list[SessionMetric]] = {}
    for s in scored:
        grouped.setdefault(_bucket_for(s.played_at, offset_minutes), []).append(s)

    breakdown: list[TimeOfDayBucket] = []
    best: TimeOfDayPreference = "UNKNOWN"
    best_score = float("-inf")
    for bucket in ("MORNING", "AFTERNOON", "EVENING", "NIGHT"):
        rows = grouped.get(bucket, [])
        if not rows:
            continue
        accuracies = [s.accuracy for s in rows if s.accuracy is not None]
        median_acc = _median(accuracies) if accuracies else None
        abandon_rate = round(sum(1 for s in rows if s.abandoned) / len(rows), 3)
        breakdown.append(
            TimeOfDayBucket(
                bucket=bucket,  # type: ignore[arg-type]
                session_count=len(rows),
                median_accuracy=median_acc,
                abandonment_rate=abandon_rate,
            )
        )
        # A bucket only competes to be "best" once there is enough of it to trust.
        if len(rows) >= _BUCKET_MIN_SESSIONS and median_acc is not None:
            score = median_acc - abandon_rate
            if score > best_score:
                best_score = score
                best = bucket  # type: ignore[assignment]

    return best, breakdown


def _response_time_trend(scored_completed: list[SessionMetric]) -> str:
    """Newest three comparable response times against the previous three."""
    timed = [s for s in _newest_first(scored_completed) if s.response_time_seconds > 0]
    if len(timed) < 4:
        return "UNKNOWN"
    recent = _median([s.response_time_seconds for s in timed[:3]])
    prior = _median([s.response_time_seconds for s in timed[3:6]]) if len(timed) > 3 else None
    if recent is None or prior is None or prior == 0:
        return "UNKNOWN"
    delta = (recent - prior) / prior
    if abs(delta) <= 0.15:
        return "STABLE"
    return "UP" if delta > 0 else "DOWN"


def _repeated_difficulty(scored_completed: list[SessionMetric]) -> bool:
    """Two or more of the last four finished sessions sat below the comfort line."""
    window = _newest_first(scored_completed)[:4]
    low = sum(1 for s in window if (s.accuracy or 0.0) < settings.decrease_accuracy)
    return len(window) >= 2 and low >= 2


def _preferred_activities(sessions: list[SessionMetric]) -> tuple[list[str], str | None]:
    recent = _newest_first(sessions)[:20]
    if not recent:
        return [], None
    scores: dict[str, float] = {}
    counts: dict[str, int] = {}
    total = len(recent)
    for game_type in {s.game_type for s in recent}:
        rows = [s for s in recent if s.game_type == game_type]
        counts[game_type] = len(rows)
        finished_rate = sum(1 for s in rows if s.completed and not s.abandoned) / len(rows)
        frequency_share = len(rows) / total
        scores[game_type] = round(0.6 * finished_rate + 0.4 * frequency_share, 4)
    ranked = sorted(scores, key=lambda g: (scores[g], counts[g]), reverse=True)
    most_played = max(counts, key=lambda g: counts[g])
    return ranked, most_played


def _fatigue_likely(sessions: list[SessionMetric], now: datetime) -> bool:
    same_day = [
        s
        for s in _newest_first(sessions)
        if (now - s.played_at) <= timedelta(hours=12)
    ]
    if len(same_day) >= 4:
        return True
    if len(same_day) < 2:
        return False
    latest = same_day[0]
    first = same_day[-1]
    if latest.abandoned:
        return True
    if (
        latest.accuracy is not None
        and first.accuracy is not None
        and first.accuracy - latest.accuracy >= 0.15
    ):
        return True
    if (
        first.engagement_duration_seconds > 0
        and latest.engagement_duration_seconds < 0.6 * first.engagement_duration_seconds
    ):
        return True
    return False


def _max_difficulty_completed(sessions: list[SessionMetric]) -> dict[str, int]:
    result: dict[str, int] = {}
    for s in sessions:
        if s.game_type == CALM_GAME_TYPE:
            continue
        if s.completed and not s.abandoned and s.accuracy is not None:
            result[s.game_type] = max(result.get(s.game_type, 0), s.difficulty)
    return result


def derive_signals(
    sessions: list[SessionMetric],
    *,
    now: datetime | None = None,
    utc_offset_minutes: int = DEFAULT_UTC_OFFSET_MINUTES,
) -> PatientSignals:
    now = now or datetime.now(timezone.utc)
    scored = _scored(sessions)
    scored_completed = [s for s in scored if s.completed and not s.abandoned and s.accuracy is not None]

    recent_scored = _newest_first(scored)[:5]
    abandonment_window = _newest_first(sessions)[: settings.abandonment_window]
    abandoned_rate = (
        round(sum(1 for s in abandonment_window if s.abandoned) / len(abandonment_window), 3)
        if abandonment_window
        else None
    )

    best_time, breakdown = _time_of_day(scored, utc_offset_minutes)
    ranked, most_played = _preferred_activities(sessions)

    signal = anomaly.detect(sessions)
    deviation = DeviationSignal(
        available=signal.available, is_unusual=signal.is_unusual, method=signal.method
    )

    repeated_difficulty = _repeated_difficulty(scored_completed)
    familiar_content = (
        repeated_difficulty
        or (abandoned_rate is not None and abandoned_rate >= settings.trend_abandonment_rate)
        or (deviation.available and deviation.is_unusual)
    )

    return PatientSignals(
        session_count=len(sessions),
        scored_session_count=len(scored),
        accuracy_median=_median([s.accuracy for s in scored_completed if s.accuracy is not None]),
        accuracy_recent_median=_median(
            [s.accuracy for s in recent_scored if s.accuracy is not None]
        ),
        response_time_median_seconds=_median(
            [s.response_time_seconds for s in scored if s.response_time_seconds > 0]
        ),
        response_time_trend=_response_time_trend(scored_completed),
        hints_median=_median([float(s.hints_used) for s in scored]),
        repeated_difficulty=repeated_difficulty,
        session_duration_median_seconds=_median(
            [float(s.engagement_duration_seconds) for s in sessions if s.engagement_duration_seconds > 0]
        ),
        sessions_last_24h=sum(1 for s in sessions if (now - s.played_at) <= timedelta(hours=24)),
        abandoned_recent_rate=abandoned_rate,
        max_difficulty_completed=_max_difficulty_completed(sessions),
        preferred_activities=ranked,
        most_played_activity=most_played,
        best_time_of_day=best_time,
        time_of_day_breakdown=breakdown,
        deviation_from_baseline=deviation,
        fatigue_likely=_fatigue_likely(sessions, now),
        familiar_content_recommended=familiar_content,
    )
