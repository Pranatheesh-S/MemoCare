"""Request and response contracts. Field names match the backend client."""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

GameTypeStr = Literal[
    "MEMORY_MATCH", "ROUTINE_BUILDER", "WHO_IS_THIS", "MEMORY_LANE", "MARKET_MEMORY"
]


class SessionMetric(BaseModel):
    """One completed (or abandoned) activity."""

    model_config = ConfigDict(extra="ignore")

    game_type: str
    difficulty: int
    accuracy: float | None = None
    response_time_seconds: float = 0.0
    hints_used: int = 0
    attempts: int = 0
    completed: bool = False
    abandoned: bool = False
    engagement_duration_seconds: int = 0
    played_at: datetime


class AdaptationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patient_id: UUID
    game_type: str
    current_difficulty: int
    sessions: list[SessionMetric] = Field(default_factory=list)


class AdaptationResponse(BaseModel):
    recommended_difficulty: int
    hint_level: int
    recommended_game_type: str
    reason_code: str
    explanation: str
    confidence: float
    evidence_session_count: int
    model_version: str
    # Always false. Present so no consumer can mistake this for a clinical claim.
    is_diagnosis: Literal[False] = False


class ReminderAdherence(BaseModel):
    model_config = ConfigDict(extra="ignore")

    acknowledged: int = 0
    missed: int = 0


class TrendRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patient_id: UUID
    period: Literal["7d", "30d"] = "7d"
    sessions: list[SessionMetric] = Field(default_factory=list)
    reminder_adherence: ReminderAdherence | None = None


class TrendIndicator(BaseModel):
    name: str
    current: float | None
    baseline: float | None
    direction: Literal["UP", "DOWN", "STABLE", "UNKNOWN"]
    sample_size: int


class TrendResponse(BaseModel):
    status: Literal["STABLE", "REVIEW_SUGGESTED", "INSUFFICIENT_DATA"]
    reason_code: str
    explanation: str
    is_diagnosis: Literal[False] = False
    indicators: list[TrendIndicator]
    session_count: int
    model_version: str


class EngagementRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patient_id: UUID
    sessions: list[SessionMetric] = Field(default_factory=list)


class EngagementResponse(BaseModel):
    recommended_game_type: str
    reason_code: str
    explanation: str
    model_version: str
    is_diagnosis: Literal[False] = False


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    rule_engine_version: str
    anomaly_model_available: bool
    gemini_planner_available: bool = False


# --- personalisation / session planning ---------------------------------------

TimeBucket = Literal["MORNING", "AFTERNOON", "EVENING", "NIGHT"]
TimeOfDayPreference = Literal["MORNING", "AFTERNOON", "EVENING", "NIGHT", "UNKNOWN"]
HintModality = Literal["VISUAL", "VOICE", "BOTH"]
SessionLength = Literal["SHORT", "STANDARD"]
ContentPreference = Literal["FAMILIAR", "STANDARD"]


class TimeOfDayBucket(BaseModel):
    bucket: TimeBucket
    session_count: int
    median_accuracy: float | None = None
    abandonment_rate: float | None = None


class DeviationSignal(BaseModel):
    available: bool
    is_unusual: bool
    method: str


class PatientSignals(BaseModel):
    """
    The observations the personalisation layer reasons over. Every field is
    derived from the patient's own session history — never compared to anyone
    else — and nothing here is a clinical measure.
    """

    session_count: int
    scored_session_count: int
    accuracy_median: float | None = None
    accuracy_recent_median: float | None = None
    response_time_median_seconds: float | None = None
    response_time_trend: Literal["UP", "DOWN", "STABLE", "UNKNOWN"] = "UNKNOWN"
    hints_median: float | None = None
    repeated_difficulty: bool = False
    session_duration_median_seconds: float | None = None
    sessions_last_24h: int = 0
    abandoned_recent_rate: float | None = None
    max_difficulty_completed: dict[str, int] = Field(default_factory=dict)
    preferred_activities: list[str] = Field(default_factory=list)
    most_played_activity: str | None = None
    best_time_of_day: TimeOfDayPreference = "UNKNOWN"
    time_of_day_breakdown: list[TimeOfDayBucket] = Field(default_factory=list)
    deviation_from_baseline: DeviationSignal
    fatigue_likely: bool = False
    familiar_content_recommended: bool = False


class PersonalisationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    patient_id: UUID
    game_type: str
    current_difficulty: int
    enabled_game_types: list[str] = Field(
        default_factory=lambda: ["MEMORY_MATCH", "WHO_IS_THIS", "ROUTINE_BUILDER", "MEMORY_LANE"]
    )
    sessions: list[SessionMetric] = Field(default_factory=list)
    # An IETF-ish locale hint ("as-IN", "en-IN") passed to the planner so
    # familiar-content wording matches the patient's language and region.
    locale: str | None = None
    # Callers can force a rules-only plan (offline audits, tests, opt-out).
    use_gemini: bool = True


class SessionPlan(BaseModel):
    recommended_game_type: str
    difficulty: int
    item_count: int
    question_count: int
    preview_seconds: int
    hint_level: int
    hint_modality: HintModality
    session_length: SessionLength
    end_with_calm_activity: bool
    content_preference: ContentPreference
    best_time_of_day: TimeOfDayPreference
    # True whenever an eligible difficulty increase was deliberately not taken,
    # or the plan leans on support rather than challenge. Comfort over level.
    comfort_first: bool
    reason_code: str
    explanation: str
    confidence: float
    source: Literal["model", "baseline"]
    signals: PatientSignals
    model_version: str
    # Always false. Present so no consumer can mistake this for a clinical claim.
    is_diagnosis: Literal[False] = False
