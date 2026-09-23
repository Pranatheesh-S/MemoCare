"""Difficulty adaptation: boundaries, evidence thresholds and safety limits."""
from __future__ import annotations

import pytest

from app.config import settings
from app.rules import adaptation
from app.safety import is_safe_text
from app.schemas import AdaptationRequest
from tests.conftest import PATIENT_ID, session


def request_for(sessions, current_difficulty=2, game_type="MEMORY_MATCH"):
    return AdaptationRequest(
        patient_id=PATIENT_ID,
        game_type=game_type,
        current_difficulty=current_difficulty,
        sessions=sessions,
    )


class TestDifficultyIncrease:
    def test_three_strong_sessions_increase_difficulty_by_one(self):
        sessions = [session(accuracy=0.86, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=2))
        assert result.recommended_difficulty == 3
        assert result.reason_code == "ACCURACY_ABOVE_THRESHOLD"
        assert result.evidence_session_count == 3

    def test_exactly_at_the_threshold_counts_as_strong(self):
        # The rule is "at least 80%", so 0.80 must qualify.
        sessions = [session(accuracy=0.80, difficulty=1, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=1))
        assert result.recommended_difficulty == 2

    def test_just_below_the_threshold_does_not_increase(self):
        sessions = [session(accuracy=0.799, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=2))
        assert result.recommended_difficulty == 2
        assert result.reason_code == "MAINTAIN_CURRENT_LEVEL"

    def test_two_strong_sessions_are_not_enough(self):
        sessions = [session(accuracy=0.9, days_ago=d) for d in (0, 1)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=2))
        assert result.recommended_difficulty == 2

    def test_only_same_difficulty_sessions_are_compared(self):
        # Strong results at an easier level must not push the current level up.
        sessions = [session(accuracy=0.95, difficulty=1, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        assert result.recommended_difficulty == 3
        assert result.reason_code == "INSUFFICIENT_EVIDENCE"


class TestDifficultyDecrease:
    def test_two_low_sessions_reduce_difficulty_by_one(self):
        sessions = [session(accuracy=0.35, difficulty=3, days_ago=d) for d in (0, 1)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        assert result.recommended_difficulty == 2
        assert result.reason_code == "ACCURACY_BELOW_THRESHOLD"

    def test_exactly_at_the_lower_threshold_does_not_decrease(self):
        # The rule is "below 50%", so 0.50 must not trigger it.
        sessions = [session(accuracy=0.50, difficulty=3, days_ago=d) for d in (0, 1)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        assert result.recommended_difficulty == 3

    def test_one_low_session_alone_changes_nothing(self):
        sessions = [session(accuracy=0.2, difficulty=3, days_ago=0), session(accuracy=0.85, difficulty=3, days_ago=1)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        assert result.recommended_difficulty == 3


class TestBoundaries:
    def test_difficulty_never_exceeds_the_maximum(self):
        sessions = [session(accuracy=0.99, difficulty=settings.max_difficulty, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=settings.max_difficulty))
        assert result.recommended_difficulty == settings.max_difficulty
        assert result.reason_code == "AT_MAXIMUM_MAINTAINED"

    def test_difficulty_never_falls_below_the_minimum(self):
        sessions = [session(accuracy=0.1, difficulty=settings.min_difficulty, days_ago=d) for d in (0, 1)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=settings.min_difficulty))
        assert result.recommended_difficulty == settings.min_difficulty
        assert result.reason_code == "AT_MINIMUM_ADDED_SUPPORT"
        assert result.hint_level == settings.max_hint_level

    def test_difficulty_never_moves_more_than_one_level(self):
        sessions = [session(accuracy=0.99, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=1))
        assert result.recommended_difficulty - 1 <= 1

    @pytest.mark.parametrize("out_of_range", [-5, 0, 9, 99])
    def test_out_of_range_current_difficulty_is_clamped(self, out_of_range):
        sessions = [session(accuracy=0.85, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=out_of_range))
        assert settings.min_difficulty <= result.recommended_difficulty <= settings.max_difficulty


class TestHintSupport:
    def test_repeated_hints_keep_difficulty_and_raise_support(self):
        sessions = [session(accuracy=0.65, hints_used=3, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=2))
        assert result.recommended_difficulty == 2
        assert result.reason_code == "HINT_SUPPORT_INCREASED"
        assert result.hint_level >= 2

    def test_hint_level_never_exceeds_the_maximum(self):
        sessions = [session(accuracy=0.65, hints_used=50, days_ago=d) for d in (0, 1, 2, 3)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=2))
        assert result.hint_level <= settings.max_hint_level


class TestAbandonment:
    def test_two_abandoned_activities_offer_a_calmer_activity(self):
        sessions = [
            session(abandoned=True, completed=False, accuracy=None, days_ago=0),
            session(abandoned=True, completed=False, accuracy=None, days_ago=1),
            session(accuracy=0.9, days_ago=2),
        ]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        assert result.reason_code == "ABANDONMENT_SUPPORT"
        assert result.recommended_game_type == "MEMORY_LANE"
        assert result.recommended_difficulty == 3  # never raised while struggling

    def test_abandonment_outranks_a_strong_accuracy_run(self):
        sessions = [
            session(abandoned=True, completed=False, accuracy=None, days_ago=0),
            session(abandoned=True, completed=False, accuracy=None, days_ago=1),
            *[session(accuracy=0.95, days_ago=d) for d in (2, 3, 4)],
        ]
        result = adaptation.recommend(request_for(sessions, current_difficulty=2))
        assert result.recommended_difficulty == 2


class TestInsufficientEvidence:
    def test_no_sessions_maintains_the_current_level(self):
        result = adaptation.recommend(request_for([], current_difficulty=2))
        assert result.recommended_difficulty == 2
        assert result.reason_code == "INSUFFICIENT_EVIDENCE"

    def test_one_unusual_session_maintains_the_current_level(self):
        result = adaptation.recommend(request_for([session(accuracy=0.05, difficulty=3)], current_difficulty=3))
        assert result.recommended_difficulty == 3
        assert result.reason_code == "INSUFFICIENT_EVIDENCE"


class TestMissingValues:
    def test_sessions_with_no_accuracy_are_not_treated_as_zero(self):
        sessions = [session(accuracy=None, completed=True, difficulty=3, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        assert result.recommended_difficulty == 3
        assert result.reason_code == "INSUFFICIENT_EVIDENCE"

    def test_defaults_apply_when_optional_fields_are_absent(self):
        from app.schemas import SessionMetric

        minimal = SessionMetric(game_type="MEMORY_MATCH", difficulty=2, played_at=session().played_at)
        result = adaptation.recommend(request_for([minimal], current_difficulty=2))
        assert result.recommended_difficulty == 2


class TestUnscoredActivity:
    def test_memory_lane_difficulty_never_changes(self):
        sessions = [session(game_type="MEMORY_LANE", accuracy=None, days_ago=d) for d in (0, 1, 2)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=1, game_type="MEMORY_LANE"))
        assert result.reason_code == "UNSCORED_ACTIVITY"
        assert result.recommended_difficulty == 1


class TestNonDiagnosticWording:
    @pytest.mark.parametrize(
        "sessions,current",
        [
            ([session(accuracy=0.9, days_ago=d) for d in (0, 1, 2)], 2),
            ([session(accuracy=0.2, difficulty=3, days_ago=d) for d in (0, 1)], 3),
            ([session(accuracy=0.65, hints_used=4, days_ago=d) for d in (0, 1, 2)], 2),
            ([session(abandoned=True, completed=False, accuracy=None, days_ago=d) for d in (0, 1)], 2),
            ([], 1),
        ],
    )
    def test_every_explanation_is_free_of_clinical_language(self, sessions, current):
        result = adaptation.recommend(request_for(sessions, current_difficulty=current))
        assert is_safe_text(result.explanation), result.explanation
        assert result.is_diagnosis is False

    def test_explanations_never_say_wrong_or_failed(self):
        sessions = [session(accuracy=0.1, difficulty=3, days_ago=d) for d in (0, 1)]
        result = adaptation.recommend(request_for(sessions, current_difficulty=3))
        lowered = result.explanation.lower()
        for banned in ("wrong", "failed", "poor", "game over"):
            assert banned not in lowered
