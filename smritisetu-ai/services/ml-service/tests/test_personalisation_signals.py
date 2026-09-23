"""Signal derivation: everything is computed from the patient's own history."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.personalisation.signals import derive_signals
from app.schemas import SessionMetric
from tests.conftest import session

NOW = datetime(2026, 8, 25, 12, 0, 0, tzinfo=timezone.utc)


def at_hour_utc(hour: int, *, accuracy: float = 0.8, abandoned: bool = False) -> SessionMetric:
    return SessionMetric(
        game_type="MEMORY_MATCH",
        difficulty=2,
        accuracy=None if abandoned else accuracy,
        response_time_seconds=9.0,
        hints_used=0,
        attempts=8,
        completed=not abandoned,
        abandoned=abandoned,
        engagement_duration_seconds=180,
        played_at=datetime(2026, 8, 20, hour, 0, 0, tzinfo=timezone.utc),
    )


class TestEmptyHistory:
    def test_no_sessions_gives_safe_defaults(self):
        sig = derive_signals([], now=NOW)
        assert sig.session_count == 0
        assert sig.accuracy_median is None
        assert sig.best_time_of_day == "UNKNOWN"
        assert sig.preferred_activities == []
        assert sig.deviation_from_baseline.available is False
        assert sig.fatigue_likely is False
        assert sig.familiar_content_recommended is False


class TestTimeOfDay:
    def test_the_bucket_with_the_best_median_accuracy_wins(self):
        # UTC+5:30: 03:00 -> 08:30 MORNING, 09:00 -> 14:30 AFTERNOON.
        morning = [at_hour_utc(3, accuracy=0.9) for _ in range(4)]
        afternoon = [at_hour_utc(9, accuracy=0.4) for _ in range(4)]
        sig = derive_signals(morning + afternoon, now=NOW)
        assert sig.best_time_of_day == "MORNING"
        buckets = {b.bucket: b for b in sig.time_of_day_breakdown}
        assert buckets["MORNING"].session_count == 4
        assert buckets["AFTERNOON"].median_accuracy == 0.4

    def test_a_thin_bucket_is_not_trusted_as_best(self):
        one_great = [at_hour_utc(3, accuracy=1.0)]
        many_ok = [at_hour_utc(9, accuracy=0.75) for _ in range(4)]
        sig = derive_signals(one_great + many_ok, now=NOW)
        assert sig.best_time_of_day == "AFTERNOON"


class TestPreferredActivities:
    def test_activities_rank_by_completion_and_frequency(self):
        loved = [session(game_type="WHO_IS_THIS", completed=True, days_ago=d) for d in range(6)]
        abandoned = [
            session(game_type="ROUTINE_BUILDER", completed=False, abandoned=True, accuracy=None, days_ago=d)
            for d in range(2)
        ]
        sig = derive_signals(loved + abandoned, now=NOW)
        assert sig.preferred_activities[0] == "WHO_IS_THIS"
        assert sig.most_played_activity == "WHO_IS_THIS"


class TestConcerningSignals:
    def test_repeated_low_accuracy_flags_repeated_difficulty_and_familiar_content(self):
        sessions = [session(accuracy=0.3, difficulty=3, days_ago=d) for d in range(4)]
        sig = derive_signals(sessions, now=NOW)
        assert sig.repeated_difficulty is True
        assert sig.familiar_content_recommended is True

    def test_four_sessions_within_the_same_stretch_looks_like_fatigue(self):
        sessions = [
            session(accuracy=0.8, days_ago=h / 24.0) for h in (0.5, 2, 4, 6)
        ]
        sig = derive_signals(sessions, now=NOW)
        assert sig.sessions_last_24h == 4
        assert sig.fatigue_likely is True

    def test_a_within_day_accuracy_drop_looks_like_fatigue(self):
        sessions = [
            session(accuracy=0.4, days_ago=0.1),   # latest
            session(accuracy=0.85, days_ago=0.4),  # earlier the same stretch
        ]
        sig = derive_signals(sessions, now=NOW)
        assert sig.fatigue_likely is True


class TestMaxDifficulty:
    def test_only_finished_scored_sessions_count_towards_max_difficulty(self):
        sessions = [
            session(difficulty=4, completed=False, abandoned=True, accuracy=None, days_ago=0),
            session(difficulty=3, completed=True, accuracy=0.7, days_ago=1),
        ]
        sig = derive_signals(sessions, now=NOW)
        assert sig.max_difficulty_completed["MEMORY_MATCH"] == 3
