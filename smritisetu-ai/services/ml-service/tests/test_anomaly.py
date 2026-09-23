"""The optional anomaly detector: secondary signal only, safe fallbacks."""
from __future__ import annotations

from dataclasses import replace
from unittest.mock import patch

import pytest

from app.config import settings
from app.models import anomaly
from app.rules import adaptation
from app.safety import is_safe_text
from app.schemas import AdaptationRequest
from tests.conftest import PATIENT_ID, session


def baseline(count=20, **kwargs):
    return [session(days_ago=i, **kwargs) for i in range(count)]


class TestBaselineRequirement:
    def test_no_sessions_means_unavailable(self):
        result = anomaly.detect([])
        assert result.available is False
        assert result.is_unusual is False

    def test_a_short_history_means_unavailable(self):
        result = anomaly.detect(baseline(count=settings.anomaly_min_baseline))
        assert result.available is False
        assert result.method == "insufficient_baseline"

    def test_enough_history_makes_it_available(self):
        result = anomaly.detect(baseline(count=settings.anomaly_min_baseline + 5))
        assert result.available is True
        assert result.method in {"isolation_forest", "robust_zscore"}

    def test_memory_lane_sessions_do_not_count_towards_the_baseline(self):
        sessions = [session(game_type="MEMORY_LANE", accuracy=None, days_ago=i) for i in range(30)]
        result = anomaly.detect(sessions)
        assert result.available is False


class TestDetection:
    def test_a_typical_recent_session_is_not_flagged(self):
        history = [
            session(
                accuracy=0.80 + (i % 5) * 0.01,
                response_time_seconds=8.5 + (i % 4) * 0.5,
                hints_used=i % 2,
                engagement_duration_seconds=170 + (i % 6) * 8,
                days_ago=i,
            )
            for i in range(1, 21)
        ]
        # Sits in the middle of the baseline on every feature, not at a corner.
        typical = session(
            accuracy=0.82, response_time_seconds=9.25, hints_used=1,
            engagement_duration_seconds=190, days_ago=0,
        )
        result = anomaly.detect([typical, *history])
        assert result.available is True
        assert result.is_unusual is False

    def test_a_wildly_different_recent_session_is_flagged(self):
        history = [
            session(
                accuracy=0.80 + (i % 5) * 0.01,
                response_time_seconds=8.5 + (i % 4) * 0.5,
                hints_used=i % 2,
                engagement_duration_seconds=170 + (i % 6) * 8,
                days_ago=i,
            )
            for i in range(1, 22)
        ]
        odd = session(
            accuracy=0.05, response_time_seconds=140.0, hints_used=25, engagement_duration_seconds=15, days_ago=0
        )
        result = anomaly.detect([odd, *history])
        assert result.available is True
        assert result.is_unusual is True


class TestFallbackBehaviour:
    def test_it_falls_back_to_the_robust_zscore_when_sklearn_fails(self):
        history = [
            session(accuracy=0.82, response_time_seconds=9.0, hints_used=1, engagement_duration_seconds=180, days_ago=i)
            for i in range(1, 22)
        ]
        odd = session(
            accuracy=0.05, response_time_seconds=140.0, hints_used=25, engagement_duration_seconds=15, days_ago=0
        )
        with patch.object(anomaly, "_isolation_forest", side_effect=ImportError("scikit-learn missing")):
            result = anomaly.detect([odd, *history])
        assert result.available is True
        assert result.method == "robust_zscore"
        assert result.is_unusual is True

    def test_disabling_the_detector_degrades_safely(self):
        # Settings is a frozen dataclass, so swap the module reference.
        with patch.object(anomaly, "settings", replace(settings, anomaly_enabled=False)):
            result = anomaly.detect(baseline(count=30))
        assert result.available is False
        assert result.method == "disabled"

    def test_a_degenerate_baseline_falls_back_instead_of_reporting_normal(self):
        """
        Every baseline session identical. An Isolation Forest cannot split such
        data and would call an extreme candidate normal, so the detector must
        hand it to the robust z-score path.
        """
        identical = [
            session(accuracy=0.8, response_time_seconds=9.0, hints_used=1, engagement_duration_seconds=180, days_ago=i)
            for i in range(1, 21)
        ]
        odd = session(
            accuracy=0.02, response_time_seconds=200.0, hints_used=40, engagement_duration_seconds=5, days_ago=0
        )
        result = anomaly.detect([odd, *identical])
        assert result.available is True
        assert result.method == "robust_zscore"
        assert result.is_unusual is True

    def test_an_identical_typical_session_on_a_degenerate_baseline_is_not_flagged(self):
        identical = [
            session(accuracy=0.8, response_time_seconds=9.0, hints_used=1, engagement_duration_seconds=180, days_ago=i)
            for i in range(20)
        ]
        result = anomaly.detect(identical)
        assert result.available is True
        assert result.is_unusual is False


class TestSafety:
    def test_no_anomaly_score_is_exposed(self):
        result = anomaly.detect(baseline(count=25))
        # The dataclass deliberately has no score field.
        assert not hasattr(result, "score")
        assert not hasattr(result, "anomaly_score")

    def test_the_explanation_is_free_of_clinical_language(self):
        result = anomaly.detect(baseline(count=25))
        assert is_safe_text(result.explanation)

    def test_the_detector_can_only_hold_an_increase_never_cause_one(self):
        """
        A flagged session must never raise difficulty. The rule engine decides;
        the detector may only withhold an increase.
        """
        from app.main import recommend_difficulty

        history = [
            session(accuracy=0.95, difficulty=2, response_time_seconds=8.0, hints_used=0, days_ago=i)
            for i in range(1, 22)
        ]
        odd = session(
            accuracy=0.98, difficulty=2, response_time_seconds=120.0, hints_used=30,
            engagement_duration_seconds=9, days_ago=0,
        )
        request = AdaptationRequest(
            patient_id=PATIENT_ID, game_type="MEMORY_MATCH", current_difficulty=2, sessions=[odd, *history]
        )
        rules_only = adaptation.recommend(request)
        with_detector = recommend_difficulty(request)

        assert rules_only.recommended_difficulty == 3  # the rules alone would raise
        assert with_detector.recommended_difficulty <= rules_only.recommended_difficulty
        if with_detector.recommended_difficulty == 2:
            assert with_detector.reason_code == "HOLD_UNUSUAL_RECENT_SESSION"
            assert is_safe_text(with_detector.explanation)
