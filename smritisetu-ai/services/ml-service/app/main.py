"""
SmritiSetu AI — explainable personalisation service.

This service decides how gentle or how challenging the next activity should be,
summarises engagement trends for a caregiver, and suggests which activity to
offer next. It does not, and must not, make any clinical claim: it never
predicts whether a patient has dementia, never states that a condition has
changed, and never says anything about medicines.
"""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.requests import Request

from .config import RULE_ENGINE_VERSION, SERVICE_VERSION, settings
from .models import anomaly
from .personalisation import plan_session
from .rules import adaptation, engagement, trends
from .safety import UnsafeOutputError, assert_safe_text
from .schemas import (
    AdaptationRequest,
    AdaptationResponse,
    EngagementRequest,
    EngagementResponse,
    HealthResponse,
    PersonalisationRequest,
    SessionPlan,
    TrendRequest,
    TrendResponse,
)
from .ml.adaptation import ml_recommend_difficulty, is_ml_available

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("smritisetu.ml")

app = FastAPI(
    title="SmritiSetu AI — Personalisation Service",
    version=SERVICE_VERSION,
    description=(
        "Explainable, non-diagnostic adaptation and trend analysis.\n\n"
        "**Safety boundary.** This service never predicts whether a patient has "
        "dementia, never states that a condition has worsened, and never "
        "comments on medicines. Every response carries a reason code, a "
        "plain-language explanation and `is_diagnosis: false`."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.exception_handler(UnsafeOutputError)
async def unsafe_output_handler(_request: Request, error: UnsafeOutputError) -> JSONResponse:
    """
    A guard-rail trip is a bug in this service, not a client error. It is
    reported as a 500 so it is never silently returned to a caregiver.
    """
    logger.error("Safety guard blocked a response: %s", error)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "UNSAFE_OUTPUT_BLOCKED",
                "message": "A generated explanation was blocked by the safety guard and not returned.",
            }
        },
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="smritisetu-ml-service",
        version=SERVICE_VERSION,
        rule_engine_version=RULE_ENGINE_VERSION,
        anomaly_model_available=anomaly.sklearn_available() and settings.anomaly_enabled,
        gemini_planner_available=settings.gemini_ready,
    )


@app.post("/v1/adaptation/recommend", response_model=AdaptationResponse, tags=["Adaptation"])
def recommend_difficulty(request: AdaptationRequest) -> AdaptationResponse:
    """
    Recommends the next difficulty and hint level for one activity.

    Uses ML-based adaptation when sufficient session history is available (≥10 sessions),
    falls back to deterministic rule engine for cold start (<10 sessions).
    The optional anomaly detector runs only as a secondary signal, and only ever
    *withholds* a difficulty increase when the most recent session looks unusual
    for this patient — it can never push a patient up a level on its own.
    """
    # Use ML engine for patients with sufficient history, otherwise fall back to rule engine
    if len(request.sessions) >= 10 and is_ml_available():
        # Get ML recommendation with trace capability
        decision, trace_info = ml_recommend_difficulty(request, trace=False)
        logger.info(
            f"ML adaptation used: {trace_info.get('ml_recommendation', {}).get('predicted_class_name', 'unknown')} "
            f"(confidence: {decision.confidence})"
        )
    else:
        # Fall back to rule engine for cold start or when ML unavailable
        decision = adaptation.recommend(request)
        if len(request.sessions) < 10:
            logger.info(
                f"Using rule engine for cold start: patient has {len(request.sessions)} sessions (< 10)"
            )
        else:
            logger.info("Using rule engine fallback: ML model not available")

    # Apply anomaly detector as brake (can only block increases, never cause them)
    # Note: Anomaly brake is INACTIVE for patients between 10-11 sessions (transition period)
    signal = anomaly.detect(request.sessions)
    if (
        signal.available
        and signal.is_unusual
        and decision.recommended_difficulty > request.current_difficulty
        and not (10 <= len(request.sessions) <= 11)  # Brake inactive for 10-11 sessions
    ):
        logger.info(
            "Holding a difficulty increase: the most recent session was unusual for this patient (%s)",
            signal.method,
        )
        decision = AdaptationResponse(
            recommended_difficulty=request.current_difficulty,
            hint_level=decision.hint_level,
            recommended_game_type=decision.recommended_game_type,
            reason_code="HOLD_UNUSUAL_RECENT_SESSION",
            explanation=assert_safe_text(
                "Results were strong enough to move up a level, but the most recent session looked "
                "different from this patient's usual pattern, so the current level continues for now."
            ),
            confidence=round(decision.confidence * 0.8, 2),
            evidence_session_count=decision.evidence_session_count,
            model_version=f"{decision.model_version}+{signal.model_version}",
        )

    return decision


@app.post("/v1/trends/analyse", response_model=TrendResponse, tags=["Trends"])
def analyse_trends(request: TrendRequest) -> TrendResponse:
    """
    Rolling 7-day or 30-day engagement analysis using robust statistics.

    A single poor session never produces an observation: at least
    `ML_TREND_MIN_SESSIONS` sessions and `ML_TREND_MIN_INDICATORS` moving
    indicators are required before "review suggested" is returned.
    """
    return trends.analyse(request)


@app.post("/v1/engagement/recommend", response_model=EngagementResponse, tags=["Engagement"])
def recommend_engagement(request: EngagementRequest) -> EngagementResponse:
    """Suggests which activity to offer next, for variety and comfort."""
    return engagement.recommend(request)


@app.post("/v1/personalisation/plan", response_model=SessionPlan, tags=["Personalisation"])
def build_session_plan(request: PersonalisationRequest) -> SessionPlan:
    """
    One comfortable plan for the patient's next activity: which game, how many
    items and questions, how long cards are shown, the hint level and whether a
    hint should be spoken, whether to shorten the session, whether to finish
    with a calm activity, and whether to lean on familiar content.

    The deterministic rule engine sets the difficulty ceiling and hint floor.
    When a Gemini key is configured the plan is refined within those bounds —
    Gemini can only make the session gentler, never harder — and every string is
    re-checked by the safety guard. With no key, or on any failure, the
    rule-based plan is returned unchanged (`source: "baseline"`).

    Difficulty is never increased when the signals show fatigue, repeated
    difficulty, recent abandonment or an unusual recent session: comfort and
    engagement come before reaching a harder level.
    """
    return plan_session(request)
