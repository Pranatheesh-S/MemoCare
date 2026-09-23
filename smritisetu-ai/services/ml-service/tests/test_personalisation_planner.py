"""
The session planner: the rule-based plan, the comfort-first guarantees, and the
bounds every Gemini refinement is forced back inside.
"""
from __future__ import annotations

import pytest

from app.config import Settings
from app.personalisation import planner
from app.personalisation.planner import ITEM_BOUNDS
from app.safety import is_safe_text
from app.schemas import PersonalisationRequest
from tests.conftest import NOW, PATIENT_ID, session


def plan_for(sessions, *, game_type="MEMORY_MATCH", current_difficulty=2, use_gemini=True):
    request = PersonalisationRequest(
        patient_id=PATIENT_ID,
        game_type=game_type,
        current_difficulty=current_difficulty,
        sessions=sessions,
        use_gemini=use_gemini,
    )
    return planner.plan_session(request, now=NOW)


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    """No test in this file may reach Gemini; each opts in with its own stub."""
    def _forbidden(_payload):
        raise AssertionError("gemini.refine_plan was called without a stub")

    monkeypatch.setattr(planner.gemini, "refine_plan", _forbidden)
    monkeypatch.setattr(Settings, "gemini_ready", property(lambda self: False))


def use_gemini_returning(monkeypatch, value):
    monkeypatch.setattr(Settings, "gemini_ready", property(lambda self: True))
    monkeypatch.setattr(planner.gemini, "refine_plan", lambda _payload: value)


class TestRuleBasedPlan:
    def test_no_history_stays_at_the_current_level_with_support(self):
        plan = plan_for([], use_gemini=False)
        assert plan.source == "baseline"
        assert plan.difficulty == 2
        assert plan.reason_code == "LIMITED_HISTORY"
        assert plan.is_diagnosis is False
        assert is_safe_text(plan.explanation)

    def test_a_smooth_run_steps_up_one_level_and_is_not_comfort_first(self):
        sessions = [session(accuracy=0.9, difficulty=2, days_ago=d) for d in (0, 1, 2, 3, 4)]
        plan = plan_for(sessions, current_difficulty=2, use_gemini=False)
        assert plan.difficulty == 3
        assert plan.reason_code == "STEP_UP_READY"
        assert plan.comfort_first is False

    def test_an_eight_card_struggle_becomes_a_four_card_round(self):
        # Spec example: repeated difficulty on an eight-card game -> four cards,
        # longer preview, familiar content, a voice hint, end on a calm activity.
        sessions = [session(accuracy=0.3, difficulty=3, days_ago=d) for d in range(4)]
        plan = plan_for(sessions, current_difficulty=3, use_gemini=False)
        assert plan.difficulty == 2  # one gentle step, never two
        assert plan.item_count == ITEM_BOUNDS["MEMORY_MATCH"][0] == 4
        assert plan.preview_seconds >= 8
        assert plan.hint_modality == "BOTH"
        assert plan.content_preference == "FAMILIAR"
        assert plan.end_with_calm_activity is True
        assert plan.comfort_first is True
        assert plan.reason_code == "GENTLER_SET"
        assert is_safe_text(plan.explanation)

    def test_difficulty_is_never_increased_while_signals_say_fatigue(self):
        # Four strong sessions in a short stretch: the rules would step up, but
        # fatigue holds the level where it is.
        sessions = [session(accuracy=0.92, difficulty=2, days_ago=h / 24.0) for h in (0.5, 2, 4, 6)]
        plan = plan_for(sessions, current_difficulty=2, use_gemini=False)
        assert plan.difficulty == 2
        assert plan.comfort_first is True
        assert plan.session_length == "SHORT"
        assert plan.reason_code == "SHORTENED_FOR_FATIGUE"

    def test_memory_lane_is_left_gentle_and_unscored(self):
        sessions = [session(game_type="MEMORY_LANE", accuracy=None, days_ago=d) for d in range(3)]
        plan = plan_for(sessions, game_type="MEMORY_LANE", current_difficulty=3, use_gemini=False)
        assert plan.recommended_game_type == "MEMORY_LANE"
        assert plan.difficulty == 3
        assert plan.reason_code == "UNSCORED_CALM_ACTIVITY"
        assert plan.item_count == 0


class TestGeminiRefinementIsBounded:
    def test_gemini_cannot_raise_difficulty_or_remove_support(self, monkeypatch):
        # A run that leans on hints: the rules raise the hint floor and hold the
        # level. Gemini must not be able to undo either.
        sessions = [session(accuracy=0.62, hints_used=3, difficulty=2, days_ago=d) for d in range(5)]
        use_gemini_returning(
            monkeypatch,
            {
                "recommended_game_type": "MEMORY_MATCH",
                "difficulty": 4,          # tries to jump two levels
                "item_count": 12,
                "question_count": 6,
                "preview_seconds": 0,
                "hint_level": 1,          # tries to remove support
                "hint_modality": "VISUAL",
                "session_length": "STANDARD",
                "end_with_calm_activity": False,
                "content_preference": "STANDARD",
                "explanation": "The patient failed and did badly.",  # unsafe wording
            },
        )
        plan = plan_for(sessions, current_difficulty=2)
        assert plan.source == "model"
        assert plan.difficulty == 2          # ceiling held, never a two-step jump
        assert plan.hint_level >= 3          # the raised hint floor is kept
        assert is_safe_text(plan.explanation)
        assert plan.is_diagnosis is False

    def test_gemini_may_soften_a_plan(self, monkeypatch):
        sessions = [session(accuracy=0.9, difficulty=2, days_ago=d) for d in (0, 1, 2, 3, 4)]
        use_gemini_returning(
            monkeypatch,
            {
                "recommended_game_type": "MEMORY_MATCH",
                "difficulty": 2,          # decline the step up the rules offered
                "item_count": 4,
                "question_count": 2,
                "preview_seconds": 10,
                "hint_level": 3,
                "hint_modality": "BOTH",
                "session_length": "SHORT",
                "end_with_calm_activity": True,
                "content_preference": "FAMILIAR",
                "explanation": "A shorter, gentler round with familiar pictures and a spoken hint.",
            },
        )
        plan = plan_for(sessions, current_difficulty=2)
        assert plan.source == "model"
        assert plan.difficulty == 2
        assert plan.session_length == "SHORT"
        assert plan.item_count == 4
        assert plan.comfort_first is True

    def test_a_gemini_failure_falls_back_to_the_rule_plan(self, monkeypatch):
        sessions = [session(accuracy=0.9, difficulty=2, days_ago=d) for d in (0, 1, 2)]
        monkeypatch.setattr(Settings, "gemini_ready", property(lambda self: True))
        monkeypatch.setattr(planner.gemini, "refine_plan", lambda _payload: None)
        plan = plan_for(sessions, current_difficulty=2)
        assert plan.source == "baseline"
        assert plan.difficulty == 3

    def test_use_gemini_false_never_calls_the_model(self, monkeypatch):
        # The autouse stub raises if refine_plan is called.
        monkeypatch.setattr(Settings, "gemini_ready", property(lambda self: True))
        sessions = [session(accuracy=0.9, difficulty=2, days_ago=d) for d in (0, 1, 2)]
        plan = plan_for(sessions, current_difficulty=2, use_gemini=False)
        assert plan.source == "baseline"
