"""
Which activity to offer next.

This is an engagement suggestion only — it is about how the patient's next few
minutes should feel, not about their abilities.
"""
from __future__ import annotations

from collections import Counter
from datetime import timedelta

from ..config import ENGAGEMENT_ENGINE_VERSION, settings
from ..safety import assert_safe_text
from ..schemas import EngagementRequest, EngagementResponse, SessionMetric

ALL_ACTIVITIES = ["MEMORY_MATCH", "WHO_IS_THIS", "ROUTINE_BUILDER", "MEMORY_LANE"]
CALM_ACTIVITY = "MEMORY_LANE"
RECOGNITION_ACTIVITY = "WHO_IS_THIS"


def recommend(request: EngagementRequest) -> EngagementResponse:
    sessions = sorted(request.sessions, key=lambda s: s.played_at, reverse=True)

    if not sessions:
        return EngagementResponse(
            recommended_game_type="MEMORY_MATCH",
            reason_code="NO_HISTORY",
            explanation=assert_safe_text(
                "No activities have been recorded yet, so a gentle picture-matching activity is offered first."
            ),
            model_version=ENGAGEMENT_ENGINE_VERSION,
        )

    recent = sessions[: settings.abandonment_window]
    abandoned = sum(1 for s in recent if s.abandoned)
    if abandoned >= settings.abandonment_threshold:
        return EngagementResponse(
            recommended_game_type=CALM_ACTIVITY,
            reason_code="RECENT_ABANDONMENT",
            explanation=assert_safe_text(
                f"{abandoned} of the last {len(recent)} activities were left before finishing, "
                "so a calm reminiscence activity with no score is offered next."
            ),
            model_version=ENGAGEMENT_ENGINE_VERSION,
        )

    # A run of effortful sessions -> offer recognition, which is warmer.
    effortful = [s for s in recent if s.accuracy is not None and s.accuracy < 0.5]
    if len(effortful) >= 2:
        return EngagementResponse(
            recommended_game_type=RECOGNITION_ACTIVITY,
            reason_code="OFFER_RECOGNITION_ACTIVITY",
            explanation=assert_safe_text(
                "Recent activities have been effortful, so a familiar-faces activity is offered next."
            ),
            model_version=ENGAGEMENT_ENGINE_VERSION,
        )

    # Otherwise rotate towards whatever has been played least recently, so the
    # day has variety.
    played = Counter(s.game_type for s in sessions[:10])
    least_played = min(ALL_ACTIVITIES, key=lambda g: (played.get(g, 0), ALL_ACTIVITIES.index(g)))
    last_played = sessions[0]
    if last_played.game_type == least_played and len(sessions) > 1:
        alternatives = [g for g in ALL_ACTIVITIES if g != least_played]
        least_played = min(alternatives, key=lambda g: played.get(g, 0))

    return EngagementResponse(
        recommended_game_type=least_played,
        reason_code="VARIETY_ROTATION",
        explanation=assert_safe_text(
            "Things are going steadily, so a different activity is offered to keep the day varied."
        ),
        model_version=ENGAGEMENT_ENGINE_VERSION,
    )


def days_since(sessions: list[SessionMetric], game_type: str) -> float | None:
    matching = [s for s in sessions if s.game_type == game_type]
    if not matching:
        return None
    newest = max(matching, key=lambda s: s.played_at)
    return (max(s.played_at for s in sessions) - newest.played_at) / timedelta(days=1)
