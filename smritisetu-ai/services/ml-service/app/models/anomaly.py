"""
Optional secondary signal: is the most recent session unusual for this patient?

Rules about this module, all of them safety rules:
  * it is a *secondary* signal only — the deterministic rule engine always
    decides the difficulty
  * it never runs without enough baseline data
  * the anomaly score is never exposed as a diagnosis, or as a score at all
  * if scikit-learn or the model is unavailable for any reason, the caller
    falls back to the rule engine and nothing breaks

Two detectors are provided: an Isolation Forest (when scikit-learn is present)
and a robust z-score using median absolute deviation, which needs no
dependencies and is used as the fallback.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from ..config import ANOMALY_MODEL_VERSION, settings
from ..schemas import SessionMetric

logger = logging.getLogger(__name__)

FEATURES = ("accuracy", "response_time_seconds", "hints_used", "engagement_duration_seconds")


@dataclass
class AnomalyResult:
    available: bool
    is_unusual: bool
    method: str
    model_version: str
    baseline_size: int
    explanation: str


def _feature_row(session: SessionMetric) -> list[float]:
    return [
        float(session.accuracy) if session.accuracy is not None else 0.0,
        float(session.response_time_seconds),
        float(session.hints_used),
        float(session.engagement_duration_seconds),
    ]


# How far a candidate must sit from a perfectly constant baseline, relative to
# that constant, before it counts as unusual. Guards against float noise.
CONSTANT_BASELINE_TOLERANCE = 0.10


def _robust_z(values: list[float], candidate: float) -> float:
    """Median absolute deviation z-score; resistant to the outliers we look for."""
    import statistics

    if not values:
        return 0.0
    median = statistics.median(values)
    deviations = [abs(v - median) for v in values]
    mad = statistics.median(deviations)
    if mad > 0:
        return abs(candidate - median) / (1.4826 * mad)

    # Degenerate column: fall back to a plain standard deviation.
    stdev = statistics.pstdev(values) if len(values) > 1 else 0.0
    if stdev > 0:
        return abs(candidate - median) / stdev

    # Perfectly constant baseline. Dividing by zero spread would report every
    # candidate as normal no matter how extreme, so compare relative to the
    # constant itself: materially different means unusual, identical means not.
    scale = max(abs(median), 1e-9)
    return float("inf") if abs(candidate - median) / scale > CONSTANT_BASELINE_TOLERANCE else 0.0


def detect(sessions: list[SessionMetric]) -> AnomalyResult:
    """
    Flags whether the newest session looks unusual against this patient's own
    baseline. Never compares one patient against another.
    """
    if not settings.anomaly_enabled:
        return AnomalyResult(
            available=False,
            is_unusual=False,
            method="disabled",
            model_version=ANOMALY_MODEL_VERSION,
            baseline_size=0,
            explanation="The secondary check is switched off in configuration.",
        )

    scored = sorted(
        (s for s in sessions if s.game_type != "MEMORY_LANE"),
        key=lambda s: s.played_at,
        reverse=True,
    )
    if len(scored) <= settings.anomaly_min_baseline:
        return AnomalyResult(
            available=False,
            is_unusual=False,
            method="insufficient_baseline",
            model_version=ANOMALY_MODEL_VERSION,
            baseline_size=max(0, len(scored) - 1),
            explanation=(
                f"A baseline of more than {settings.anomaly_min_baseline} sessions is needed before "
                "the secondary check runs. The rule engine decides on its own until then."
            ),
        )

    candidate, baseline = scored[0], scored[1:]

    try:
        return _isolation_forest(candidate, baseline)
    except Exception as error:  # noqa: BLE001 — any failure must degrade safely
        logger.warning("Isolation Forest unavailable, using robust z-score: %s", error)

    return _robust_zscore(candidate, baseline)


class DegenerateBaselineError(ValueError):
    """Raised when a baseline carries no variance for a forest to split on."""


def _isolation_forest(candidate: SessionMetric, baseline: list[SessionMetric]) -> AnomalyResult:
    import numpy as np
    from sklearn.ensemble import IsolationForest

    matrix = np.array([_feature_row(s) for s in baseline], dtype=float)

    # An Isolation Forest cannot isolate anything when every baseline row is
    # identical: it has no split to make, so it would report every candidate as
    # normal no matter how extreme. Hand those baselines to the robust
    # z-score path instead, which handles them correctly.
    if float(np.max(np.ptp(matrix, axis=0))) < 1e-9:
        raise DegenerateBaselineError("baseline has no variance to split on")

    # Features live on very different scales (accuracy 0-1, engagement in
    # hundreds of seconds). Standardise so no single feature dominates the
    # splits purely because its numbers are larger.
    centre = np.median(matrix, axis=0)
    spread = np.ptp(matrix, axis=0)
    spread[spread < 1e-9] = 1.0
    scaled = (matrix - centre) / spread
    candidate_scaled = (np.array([_feature_row(candidate)], dtype=float) - centre) / spread

    model = IsolationForest(
        n_estimators=200,
        contamination=settings.anomaly_contamination,
        random_state=42,
    )
    model.fit(scaled)

    # `predict` forces a fixed outlier fraction, so on a small baseline it always
    # labels some points as outliers regardless of how ordinary they are. Score
    # the candidate against the baseline's own score distribution instead: it is
    # unusual only if it sits below almost every baseline session.
    baseline_scores = model.score_samples(scaled)
    candidate_score = float(model.score_samples(candidate_scaled)[0])
    threshold = float(np.percentile(baseline_scores, 5))
    is_unusual = candidate_score < threshold

    return AnomalyResult(
        available=True,
        is_unusual=is_unusual,
        method="isolation_forest",
        model_version=ANOMALY_MODEL_VERSION,
        baseline_size=len(baseline),
        # No score is exposed, and the wording stays descriptive.
        explanation=(
            "The most recent session looked different from this patient's usual pattern."
            if is_unusual
            else "The most recent session was in line with this patient's usual pattern."
        ),
    )


def _robust_zscore(candidate: SessionMetric, baseline: list[SessionMetric]) -> AnomalyResult:
    candidate_row = _feature_row(candidate)
    baseline_rows = [_feature_row(s) for s in baseline]

    unusual_features = 0
    for index in range(len(FEATURES)):
        column = [row[index] for row in baseline_rows]
        if _robust_z(column, candidate_row[index]) >= 3.0:
            unusual_features += 1

    # At least two features must look unusual, mirroring the trend rule that a
    # single moving indicator is never enough.
    is_unusual = unusual_features >= 2
    return AnomalyResult(
        available=True,
        is_unusual=is_unusual,
        method="robust_zscore",
        model_version=ANOMALY_MODEL_VERSION,
        baseline_size=len(baseline),
        explanation=(
            "The most recent session looked different from this patient's usual pattern."
            if is_unusual
            else "The most recent session was in line with this patient's usual pattern."
        ),
    )


def sklearn_available() -> bool:
    try:
        import sklearn  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False
