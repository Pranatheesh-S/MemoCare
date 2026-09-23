"""The /v1/personalisation/plan surface."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import app
from app.personalisation import planner
from app.safety import is_safe_text
from tests.conftest import PATIENT_ID, session

client = TestClient(app)


def payload(s):
    return {
        "game_type": s.game_type,
        "difficulty": s.difficulty,
        "accuracy": s.accuracy,
        "response_time_seconds": s.response_time_seconds,
        "hints_used": s.hints_used,
        "attempts": s.attempts,
        "completed": s.completed,
        "abandoned": s.abandoned,
        "engagement_duration_seconds": s.engagement_duration_seconds,
        "played_at": s.played_at.isoformat(),
    }


def body(sessions, *, game_type="MEMORY_MATCH", current_difficulty=2, **extra):
    return {
        "patient_id": str(PATIENT_ID),
        "game_type": game_type,
        "current_difficulty": current_difficulty,
        "sessions": [payload(s) for s in sessions],
        **extra,
    }


@pytest.fixture(autouse=True)
def offline_planner(monkeypatch):
    """The endpoint must answer without a network call in tests."""
    monkeypatch.setattr(planner.gemini, "refine_plan", lambda _payload: None)
    monkeypatch.setattr(Settings, "gemini_ready", property(lambda self: False))


class TestHealth:
    def test_health_reports_planner_availability_as_a_bool(self):
        body_ = client.get("/health").json()
        assert isinstance(body_["gemini_planner_available"], bool)


class TestPlanEndpoint:
    def test_an_empty_history_returns_a_gentle_baseline_plan(self):
        response = client.post("/v1/personalisation/plan", json=body([]))
        assert response.status_code == 200
        data = response.json()
        assert data["source"] == "baseline"
        assert data["difficulty"] == 2
        assert data["is_diagnosis"] is False
        assert is_safe_text(data["explanation"])
        assert data["signals"]["session_count"] == 0

    def test_a_struggling_run_is_taken_down_gently_with_more_support(self):
        sessions = [session(accuracy=0.3, difficulty=3, days_ago=d) for d in range(4)]
        response = client.post(
            "/v1/personalisation/plan", json=body(sessions, current_difficulty=3)
        )
        data = response.json()
        assert data["difficulty"] == 2
        assert data["comfort_first"] is True
        assert data["end_with_calm_activity"] is True
        assert data["hint_modality"] == "BOTH"

    def test_memory_lane_stays_unscored(self):
        response = client.post(
            "/v1/personalisation/plan",
            json=body([], game_type="MEMORY_LANE", current_difficulty=3),
        )
        data = response.json()
        assert data["reason_code"] == "UNSCORED_CALM_ACTIVITY"
        assert data["difficulty"] == 3

    def test_a_malformed_body_is_rejected_with_422(self):
        response = client.post("/v1/personalisation/plan", json={"game_type": "MEMORY_MATCH"})
        assert response.status_code == 422

    def test_unknown_payload_fields_are_ignored(self):
        response = client.post(
            "/v1/personalisation/plan",
            json={**body([session()]), "surprise": "ignored"},
        )
        assert response.status_code == 200

    def test_the_model_path_is_still_bounded_end_to_end(self, monkeypatch):
        monkeypatch.setattr(Settings, "gemini_ready", property(lambda self: True))
        monkeypatch.setattr(
            planner.gemini,
            "refine_plan",
            lambda _payload: {
                "recommended_game_type": "MEMORY_MATCH",
                "difficulty": 4,
                "item_count": 12,
                "question_count": 6,
                "preview_seconds": 0,
                "hint_level": 1,
                "hint_modality": "VISUAL",
                "session_length": "STANDARD",
                "end_with_calm_activity": False,
                "content_preference": "STANDARD",
                "explanation": "A calm, familiar round.",
            },
        )
        sessions = [session(accuracy=0.9, difficulty=2, days_ago=d) for d in (0, 1, 2, 3, 4)]
        data = client.post(
            "/v1/personalisation/plan", json=body(sessions, current_difficulty=2)
        ).json()
        assert data["source"] == "model"
        assert data["difficulty"] <= 3
        assert is_safe_text(data["explanation"])
