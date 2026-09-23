"""Trend analysis: evidence thresholds, robustness and non-diagnostic wording."""
from __future__ import annotations

import pytest

from app.config import settings
from app.rules import trends
from app.safety import is_safe_text
from app.schemas import ReminderAdherence, TrendRequest
from tests.conftest import NOW, PATIENT_ID, session


def request_for(sessions, period="7d", adherence=None):
    return TrendRequest(
        patient_id=PATIENT_ID,
        period=period,
        sessions=sessions,
        reminder_adherence=adherence,
    )


def steady_baseline(count=8, *, accuracy=0.85, hints=0, response=8.0, start_day=8):
    """Comfortable sessions sitting in the period *before* the analysis window."""
    return [
        session(accuracy=accuracy, hints_used=hints, response_time_seconds=response, days_ago=start_day + i * 0.5)
        for i in range(count)
    ]


class TestEvidenceThresholds:
    def test_no_sessions_returns_insufficient_data(self):
        result = trends.analyse(request_for([]), now=NOW)
        assert result.status == "INSUFFICIENT_DATA"
        assert result.reason_code == "NOT_ENOUGH_SESSIONS"

    def test_below_the_minimum_session_count_returns_insufficient_data(self):
        sessions = [session(days_ago=d) for d in range(settings.trend_min_sessions - 1)]
        result = trends.analyse(request_for(sessions), now=NOW)
        assert result.status == "INSUFFICIENT_DATA"

    def test_a_single_poor_session_never_produces_an_observation(self):
        sessions = [
            session(accuracy=0.05, hints_used=9, response_time_seconds=40, days_ago=0),
            *[session(accuracy=0.85, days_ago=d) for d in (1, 2, 3, 4, 5)],
            *steady_baseline(),
        ]
        result = trends.analyse(request_for(sessions), now=NOW)
        assert result.status == "STABLE"


class TestReviewSuggested:
    def test_two_moving_indicators_suggest_review(self):
        # More hints AND lower accuracy than the previous period.
        current = [
            session(accuracy=0.60, hints_used=3, days_ago=d) for d in (0, 1, 2, 3, 4, 5)
        ]
        result = trends.analyse(request_for([*current, *steady_baseline()]), now=NOW)
        assert result.status == "REVIEW_SUGGESTED"
        assert result.reason_code in {"SUSTAINED_ACCURACY_CHANGE", "SUSTAINED_HINT_INCREASE"}
        assert "not a diagnosis" in result.explanation.lower()

    def test_one_moving_indicator_alone_does_not_suggest_review(self):
        # Hints rise but accuracy and response time hold steady.
        current = [session(accuracy=0.85, hints_used=3, days_ago=d) for d in (0, 1, 2, 3, 4, 5)]
        result = trends.analyse(request_for([*current, *steady_baseline()]), now=NOW)
        assert result.status == "STABLE"
        assert result.reason_code == "SINGLE_INDICATOR_ONLY"

    def test_steady_activity_is_reported_as_stable(self):
        current = [session(accuracy=0.85, hints_used=0, days_ago=d) for d in (0, 1, 2, 3, 4, 5)]
        result = trends.analyse(request_for([*current, *steady_baseline()]), now=NOW)
        assert result.status == "STABLE"
        assert result.reason_code == "NO_SUSTAINED_CHANGE"


class TestRobustness:
    def test_one_outlier_session_does_not_move_the_median(self):
        current = [
            session(accuracy=0.85, hints_used=0, days_ago=0),
            session(accuracy=0.85, hints_used=0, days_ago=1),
            session(accuracy=0.02, hints_used=20, response_time_seconds=300, days_ago=2),
            session(accuracy=0.85, hints_used=0, days_ago=3),
            session(accuracy=0.86, hints_used=0, days_ago=4),
            session(accuracy=0.84, hints_used=0, days_ago=5),
        ]
        result = trends.analyse(request_for([*current, *steady_baseline()]), now=NOW)
        assert result.status == "STABLE"
        accuracy = next(i for i in result.indicators if i.name == "median_accuracy")
        assert accuracy.current is not None and accuracy.current > 0.8

    def test_memory_lane_is_excluded_from_scored_indicators(self):
        current = [session(game_type="MEMORY_LANE", accuracy=None, days_ago=d) for d in range(8)]
        result = trends.analyse(request_for(current), now=NOW)
        assert result.status == "INSUFFICIENT_DATA"

    def test_missing_accuracy_values_are_ignored_not_zeroed(self):
        current = [session(accuracy=None, days_ago=d) for d in range(6)]
        result = trends.analyse(request_for([*current, *steady_baseline()]), now=NOW)
        accuracy = next(i for i in result.indicators if i.name == "median_accuracy")
        assert accuracy.current is None

    def test_no_baseline_period_does_not_crash(self):
        current = [session(accuracy=0.5, days_ago=d) for d in range(6)]
        result = trends.analyse(request_for(current), now=NOW)
        assert result.status in {"STABLE", "REVIEW_SUGGESTED", "INSUFFICIENT_DATA"}


class TestAbandonmentAndAdherence:
    def test_high_abandonment_counts_as_an_indicator(self):
        current = [
            session(abandoned=True, completed=False, accuracy=None, days_ago=0),
            session(abandoned=True, completed=False, accuracy=None, days_ago=1),
            session(abandoned=True, completed=False, accuracy=None, days_ago=2),
            session(accuracy=0.6, hints_used=3, days_ago=3),
            session(accuracy=0.6, hints_used=3, days_ago=4),
            session(accuracy=0.6, hints_used=3, days_ago=5),
        ]
        result = trends.analyse(request_for([*current, *steady_baseline()]), now=NOW)
        assert result.status == "REVIEW_SUGGESTED"

    def test_reminder_adherence_is_reported_as_an_indicator(self):
        current = [session(accuracy=0.85, days_ago=d) for d in range(6)]
        result = trends.analyse(
            request_for([*current, *steady_baseline()], adherence=ReminderAdherence(acknowledged=4, missed=6)),
            now=NOW,
        )
        names = {i.name for i in result.indicators}
        assert "reminder_adherence_rate" in names

    def test_adherence_with_no_reminders_is_omitted(self):
        current = [session(accuracy=0.85, days_ago=d) for d in range(6)]
        result = trends.analyse(
            request_for([*current, *steady_baseline()], adherence=ReminderAdherence(acknowledged=0, missed=0)),
            now=NOW,
        )
        names = {i.name for i in result.indicators}
        assert "reminder_adherence_rate" not in names


class TestPeriods:
    @pytest.mark.parametrize("period", ["7d", "30d"])
    def test_both_periods_are_supported(self, period):
        sessions = [session(accuracy=0.8, days_ago=d) for d in range(0, 20)]
        result = trends.analyse(request_for(sessions, period=period), now=NOW)
        assert result.model_version
        assert result.session_count >= 0


class TestNonDiagnosticWording:
    @pytest.mark.parametrize(
        "sessions",
        [
            [],
            [session(accuracy=0.85, days_ago=d) for d in range(6)],
            [session(accuracy=0.4, hints_used=5, days_ago=d) for d in range(6)] + steady_baseline(),
            [session(abandoned=True, completed=False, accuracy=None, days_ago=d) for d in range(6)] + steady_baseline(),
        ],
    )
    def test_every_explanation_is_free_of_clinical_language(self, sessions):
        result = trends.analyse(request_for(sessions), now=NOW)
        assert is_safe_text(result.explanation), result.explanation
        assert result.is_diagnosis is False

    def test_forbidden_phrases_never_appear(self):
        sessions = [session(accuracy=0.3, hints_used=6, days_ago=d) for d in range(6)] + steady_baseline()
        result = trends.analyse(request_for(sessions), now=NOW)
        lowered = result.explanation.lower()
        for banned in ("dementia", "worsen", "high risk", "high-risk", "medicine must", "declin"):
            assert banned not in lowered
        # The only permitted mention of diagnosis is the explicit disclaimer.
        assert "diagnos" not in lowered.replace("this is not a diagnosis.", "")
