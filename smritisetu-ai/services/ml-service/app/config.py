"""Runtime configuration for the SmritiSetu AI personalisation service."""
from __future__ import annotations

import os
from dataclasses import dataclass, field

try:  # Loading a local .env is a convenience for development only.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # noqa: BLE001 — the service must start with or without python-dotenv
    pass


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    """Every threshold is configurable, and every default is deliberately cautious."""

    port: int = field(default_factory=lambda: _int("ML_PORT", 8000))
    log_level: str = field(default_factory=lambda: os.getenv("ML_LOG_LEVEL", "info"))

    min_difficulty: int = field(default_factory=lambda: _int("ML_MIN_DIFFICULTY", 1))
    max_difficulty: int = field(default_factory=lambda: _int("ML_MAX_DIFFICULTY", 4))

    # --- adaptation rule thresholds -------------------------------------
    increase_accuracy: float = field(default_factory=lambda: _float("ML_INCREASE_ACCURACY", 0.80))
    increase_min_sessions: int = field(default_factory=lambda: _int("ML_INCREASE_MIN_SESSIONS", 3))
    decrease_accuracy: float = field(default_factory=lambda: _float("ML_DECREASE_ACCURACY", 0.50))
    decrease_min_sessions: int = field(default_factory=lambda: _int("ML_DECREASE_MIN_SESSIONS", 2))
    hint_threshold: float = field(default_factory=lambda: _float("ML_HINT_THRESHOLD", 2.0))
    hint_min_sessions: int = field(default_factory=lambda: _int("ML_HINT_MIN_SESSIONS", 3))
    abandonment_threshold: int = field(default_factory=lambda: _int("ML_ABANDONMENT_THRESHOLD", 2))
    abandonment_window: int = field(default_factory=lambda: _int("ML_ABANDONMENT_WINDOW", 5))
    max_hint_level: int = field(default_factory=lambda: _int("ML_MAX_HINT_LEVEL", 3))

    # --- trend thresholds ------------------------------------------------
    trend_min_sessions: int = field(default_factory=lambda: _int("ML_TREND_MIN_SESSIONS", 5))
    trend_min_indicators: int = field(default_factory=lambda: _int("ML_TREND_MIN_INDICATORS", 2))
    trend_accuracy_drop: float = field(default_factory=lambda: _float("ML_TREND_ACCURACY_DROP", 0.15))
    trend_hint_increase: float = field(default_factory=lambda: _float("ML_TREND_HINT_INCREASE", 1.0))
    trend_response_increase: float = field(default_factory=lambda: _float("ML_TREND_RESPONSE_INCREASE", 0.40))
    trend_abandonment_rate: float = field(default_factory=lambda: _float("ML_TREND_ABANDONMENT_RATE", 0.30))
    trend_adherence_drop: float = field(default_factory=lambda: _float("ML_TREND_ADHERENCE_DROP", 0.30))

    # --- optional anomaly detector ---------------------------------------
    anomaly_enabled: bool = field(default_factory=lambda: _bool("ML_ANOMALY_ENABLED", True))
    anomaly_min_baseline: int = field(default_factory=lambda: _int("ML_ANOMALY_MIN_BASELINE", 12))
    anomaly_contamination: float = field(default_factory=lambda: _float("ML_ANOMALY_CONTAMINATION", 0.1))

    # --- optional Gemini session planner -------------------------------------
    # A secondary refinement layer only. It may soften a plan (fewer items, more
    # preview time, shorter session, a calmer follow-up) but the deterministic
    # rule engine still sets the ceiling: Gemini can never raise difficulty or
    # remove hint support, every string it returns is re-checked by safety.py,
    # and if the key is missing or the call fails the rule-based plan is used.
    gemini_enabled: bool = field(default_factory=lambda: _bool("ML_GEMINI_ENABLED", True))
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", "").strip())
    gemini_model: str = field(default_factory=lambda: os.getenv("ML_GEMINI_MODEL", "gemini-2.5-flash"))
    gemini_timeout_ms: int = field(default_factory=lambda: _int("ML_GEMINI_TIMEOUT_MS", 12000))
    gemini_base_url: str = field(
        default_factory=lambda: os.getenv(
            "ML_GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta"
        ).rstrip("/")
    )

    @property
    def gemini_ready(self) -> bool:
        return self.gemini_enabled and bool(self.gemini_api_key)


settings = Settings()

RULE_ENGINE_VERSION = "rules-1.0.0"
TREND_ENGINE_VERSION = "trends-rules-1.0.0"
ENGAGEMENT_ENGINE_VERSION = "engagement-rules-1.0.0"
ANOMALY_MODEL_VERSION = "anomaly-iforest-1.0.0"
PERSONALISATION_ENGINE_VERSION = "personalisation-rules-1.0.0"
GEMINI_PLANNER_VERSION = "personalisation-gemini-1.0.0"
SERVICE_VERSION = "1.0.0"
