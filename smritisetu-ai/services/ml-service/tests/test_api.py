"""End-to-end tests over the FastAPI surface."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
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


class TestHealth:
    def test_health_reports_the_rule_engine_version(self):
        response = client.get("/health")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "ok"
        assert body["rule_engine_version"]


class TestAdaptationEndpoint:
    def test_it_recommends_an_increase_for_a_strong_run(self):
        sessions = [session(accuracy=0.9, difficulty=2, days_ago=d) for d in (0, 1, 2)]
        response = client.post(
            "/v1/adaptation/recommend",
            json={
                "patient_id": str(PATIENT_ID),
                "game_type": "MEMORY_MATCH",
                "current_difficulty": 2,
                "sessions": [payload(s) for s in sessions],
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["recommended_difficulty"] == 3
        assert body["is_diagnosis"] is False
        assert is_safe_text(body["explanation"])

    def test_an_empty_session_list_is_accepted(self):
        response = client.post(
            "/v1/adaptation/recommend",
            json={
                "patient_id": str(PATIENT_ID),
                "game_type": "MEMORY_MATCH",
                "current_difficulty": 2,
                "sessions": [],
            },
        )
        assert response.status_code == 200
        assert response.json()["recommended_difficulty"] == 2

    def test_a_malformed_body_is_rejected_with_422(self):
        response = client.post("/v1/adaptation/recommend", json={"game_type": "MEMORY_MATCH"})
        assert response.status_code == 422

    def test_unknown_payload_fields_are_ignored(self):
        response = client.post(
            "/v1/adaptation/recommend",
            json={
                "patient_id": str(PATIENT_ID),
                "game_type": "MEMORY_MATCH",
                "current_difficulty": 1,
                "sessions": [{**payload(session()), "surprise_field": "ignored"}],
                "another_surprise": 42,
            },
        )
        assert response.status_code == 200


class TestTrendsEndpoint:
    def test_it_returns_insufficient_data_without_enough_sessions(self):
        response = client.post(
            "/v1/trends/analyse",
            json={"patient_id": str(PATIENT_ID), "period": "7d", "sessions": []},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "INSUFFICIENT_DATA"
        assert body["is_diagnosis"] is False

    @pytest.mark.parametrize("period", ["7d", "30d"])
    def test_both_periods_work(self, period):
        sessions = [session(accuracy=0.8, days_ago=d) for d in range(0, 12)]
        response = client.post(
            "/v1/trends/analyse",
            json={
                "patient_id": str(PATIENT_ID),
                "period": period,
                "sessions": [payload(s) for s in sessions],
                "reminder_adherence": {"acknowledged": 10, "missed": 2},
            },
        )
        assert response.status_code == 200
        assert response.json()["is_diagnosis"] is False

    def test_an_invalid_period_is_rejected(self):
        response = client.post(
            "/v1/trends/analyse",
            json={"patient_id": str(PATIENT_ID), "period": "90d", "sessions": []},
        )
        assert response.status_code == 422


class TestEngagementEndpoint:
    def test_no_history_offers_a_gentle_first_activity(self):
        response = client.post(
            "/v1/engagement/recommend",
            json={"patient_id": str(PATIENT_ID), "sessions": []},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["recommended_game_type"] == "MEMORY_MATCH"
        assert body["reason_code"] == "NO_HISTORY"

    def test_repeated_abandonment_offers_the_calm_activity(self):
        sessions = [
            session(abandoned=True, completed=False, accuracy=None, days_ago=0),
            session(abandoned=True, completed=False, accuracy=None, days_ago=1),
        ]
        response = client.post(
            "/v1/engagement/recommend",
            json={"patient_id": str(PATIENT_ID), "sessions": [payload(s) for s in sessions]},
        )
        body = response.json()
        assert body["recommended_game_type"] == "MEMORY_LANE"
        assert is_safe_text(body["explanation"])
