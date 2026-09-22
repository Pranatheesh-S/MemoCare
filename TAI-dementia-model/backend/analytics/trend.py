"""
trend.py – Baseline computation + Z-score anomaly detection + PELT change detection.
Raises Alert records when behavioral patterns deviate significantly.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta

import numpy as np

from backend.config import (
    BASELINE_MIN_SESSIONS,
    ALERT_MILD_ZSCORE, ALERT_MODERATE_ZSCORE, ALERT_MAJOR_ZSCORE,
)
from backend.database import SessionLocal, Alert
from backend.analytics.logger import get_feature_history

# ── Metric groups that we track individually ──────────────────────────
TRACKED_METRICS = [
    "mean_response_latency_s",
    "mean_pause_duration_s",
    "words_per_minute",
    "type_token_ratio",
    "topic_coherence_score",
    "task_score",
]

METRIC_LABELS = {
    "mean_response_latency_s": "Response Timing",
    "mean_pause_duration_s":   "Pause Duration",
    "words_per_minute":        "Speech Rate",
    "type_token_ratio":        "Word Variety",
    "topic_coherence_score":   "Topic Coherence",
    "task_score":              "Memory Task Score",
}


def _severity(z: float) -> str:
    az = abs(z)
    if az >= ALERT_MAJOR_ZSCORE:
        return "significant_deviation"
    elif az >= ALERT_MODERATE_ZSCORE:
        return "notable_deviation"
    elif az >= ALERT_MILD_ZSCORE:
        return "small_deviation"
    return "none"


def _confidence(n_deviant: int) -> str:
    if n_deviant >= 5:
        return "high"
    elif n_deviant >= 2:
        return "medium"
    return "low"


def compute_baseline(values: list[float]) -> tuple[float, float]:
    """Return (mean, std) for baseline values. std is at least 1e-6."""
    arr = np.array(values, dtype=float)
    return float(arr.mean()), max(float(arr.std()), 1e-6)


def run_trend_check(user_id: int) -> list[dict]:
    """
    1. Load feature history for the user.
    2. Use first BASELINE_MIN_SESSIONS sessions as baseline.
    3. For each subsequent session, compute Z-score per metric.
    4. Use PELT (ruptures) to find change-points.
    5. Create Alert rows for new detections.
    Returns list of alert dicts created this run.
    """
    history = get_feature_history(user_id)

    if len(history) < BASELINE_MIN_SESSIONS + 1:
        print(f"[Trend] User {user_id}: only {len(history)} sessions — need {BASELINE_MIN_SESSIONS+1} minimum.")
        return []

    baseline_rows = history[:BASELINE_MIN_SESSIONS]
    recent_rows = history[BASELINE_MIN_SESSIONS:]

    alerts_created = []

    for metric in TRACKED_METRICS:
        baseline_vals = [r[metric] or 0.0 for r in baseline_rows]
        mu, sigma = compute_baseline(baseline_vals)

        recent_vals = np.array([r[metric] or 0.0 for r in recent_rows])
        z_scores = (recent_vals - mu) / sigma

        # ── PELT change-point detection (if enough data) ─────────────
        change_points: list[int] = []
        if len(recent_vals) >= 6:
            try:
                import ruptures as rpt
                model = rpt.Pelt(model="rbf").fit(recent_vals.reshape(-1, 1))
                change_points = model.predict(pen=3)[:-1]  # drop trailing sentinel
            except Exception as e:
                print(f"[Trend] PELT error for {metric}: {e}")

        # ── Identify sustained deviation ──────────────────────────────
        # Count sessions AFTER any change-point with |z| >= MILD threshold
        analysis_start = change_points[-1] if change_points else 0
        deviant_zs = z_scores[analysis_start:]
        deviant_sessions = [z for z in deviant_zs if abs(z) >= ALERT_MILD_ZSCORE]

        if not deviant_sessions:
            continue

        max_z = float(deviant_zs[np.argmax(np.abs(deviant_zs))])
        severity = _severity(max_z)
        if severity == "none":
            continue

        confidence = _confidence(len(deviant_sessions))
        duration_weeks = max(1, len(deviant_sessions) // 2)
        change_pct = abs(max_z * sigma / (mu + 1e-9)) * 100

        # ── Persist alert ─────────────────────────────────────────────
        explanation = ""
        try:
            from backend.conversation.engine import explain_alert
            explanation = explain_alert(
                metric=METRIC_LABELS[metric],
                change_pct=change_pct,
                duration_weeks=duration_weeks,
            )
        except Exception as e:
            explanation = f"Pattern in '{METRIC_LABELS[metric]}' changed by ~{change_pct:.0f}% from usual."

        db = SessionLocal()
        alert = Alert(
            user_id=user_id,
            created_at=datetime.now(timezone.utc),
            severity=severity,
            affected_metric=metric,
            magnitude=round(max_z, 3),
            duration_weeks=duration_weeks,
            confidence=confidence,
            explanation=explanation,
            seen_by_carer=False,
        )
        db.add(alert)
        db.commit()
        db.close()

        alerts_created.append({
            "metric": METRIC_LABELS[metric],
            "severity": severity,
            "z_score": round(max_z, 3),
            "confidence": confidence,
            "explanation": explanation,
        })
        print(f"[Trend] Alert raised for user {user_id}: {metric} | severity={severity} | z={max_z:.2f}")

    return alerts_created


def get_user_alerts(user_id: int, limit: int = 20) -> list[dict]:
    """Retrieve latest alerts for caregiver dashboard."""
    db = SessionLocal()
    rows = (
        db.query(Alert)
        .filter(Alert.user_id == user_id)
        .order_by(Alert.created_at.desc())
        .limit(limit)
        .all()
    )
    result = [
        {
            "id": r.id,
            "created_at": r.created_at.isoformat() if r.created_at else "",
            "severity": r.severity,
            "metric": METRIC_LABELS.get(r.affected_metric, r.affected_metric),
            "magnitude": r.magnitude,
            "duration_weeks": r.duration_weeks,
            "confidence": r.confidence,
            "explanation": r.explanation,
            "seen": r.seen_by_carer,
        }
        for r in rows
    ]
    db.close()
    return result


def get_trend_sparklines(user_id: int) -> dict[str, list[float]]:
    """Return last 20 sessions' values per metric for dashboard sparklines."""
    history = get_feature_history(user_id)[-20:]
    return {
        METRIC_LABELS[m]: [round(r[m] or 0.0, 3) for r in history]
        for m in TRACKED_METRICS
    }
