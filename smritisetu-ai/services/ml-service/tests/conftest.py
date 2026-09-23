from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.schemas import SessionMetric  # noqa: E402

PATIENT_ID = uuid4()
NOW = datetime(2026, 8, 25, 12, 0, 0, tzinfo=timezone.utc)


def session(
    *,
    game_type: str = "MEMORY_MATCH",
    difficulty: int = 2,
    accuracy: float | None = 0.8,
    response_time_seconds: float = 9.0,
    hints_used: int = 0,
    attempts: int = 8,
    completed: bool = True,
    abandoned: bool = False,
    engagement_duration_seconds: int = 180,
    days_ago: float = 0.0,
) -> SessionMetric:
    """Builds one session metric; days_ago is relative to a fixed NOW."""
    return SessionMetric(
        game_type=game_type,
        difficulty=difficulty,
        accuracy=accuracy,
        response_time_seconds=response_time_seconds,
        hints_used=hints_used,
        attempts=attempts,
        completed=completed,
        abandoned=abandoned,
        engagement_duration_seconds=engagement_duration_seconds,
        played_at=NOW - timedelta(days=days_ago),
    )


@pytest.fixture
def patient_id():
    return PATIENT_ID


@pytest.fixture
def now():
    return NOW


@pytest.fixture
def make_session():
    return session
