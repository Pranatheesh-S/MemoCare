"""
config.py – Load all settings from .env
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ── API Keys ──────────────────────────────────
GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
HF_TOKEN: str = os.getenv("HF_TOKEN", "")

# ── App ───────────────────────────────────────
APP_HOST: str = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT: int = int(os.getenv("APP_PORT", "8000"))

# ── Storage ───────────────────────────────────
BASE_DIR = Path(__file__).parent.parent
DB_PATH: Path = BASE_DIR / os.getenv("DB_PATH", "data/companion.db")
CHROMA_PATH: Path = BASE_DIR / os.getenv("CHROMA_PATH", "data/chroma")

# ── Speech ────────────────────────────────────
SUPPORTED_LANGUAGES: list[str] = ["en", "hi", "as", "ta", "bn", "mni", "brx", "ne"]
WHISPER_MODEL: str = os.getenv("WHISPER_MODEL", "base")
PRIMARY_LANG: str = os.getenv("PRIMARY_LANG", "en")

ASR_ENGINE_MAP: dict[str, str] = {
    "en": "whisper",
    "hi": "indicconformer",
    "as": "indicconformer",
    "ta": "indicconformer",
    "bn": "indicconformer",
    "mni": "indicconformer",
    "brx": "indicconformer",
    "ne": "indicconformer",
}

TTS_ENGINE_MAP: dict[str, str] = {
    "en": "gtts",
    "hi": "gtts",
    "as": "indic_parler",
    "ta": "indic_parler",
    "bn": "indic_parler",
    "mni": "indic_parler",
    "brx": "indic_parler",
    "ne": "indic_parler",
}

ASR_MODEL_ID = "ai4bharat/indic-conformer-600m-multilingual"
TTS_MODEL_ID = os.getenv("TTS_MODEL_ID", "ai4bharat/indic-parler-tts")
HF_CACHE_DIR = os.getenv("HF_CACHE_DIR", "")
USE_GPU = os.getenv("USE_GPU", "false").lower() == "true"

# ── Analytics / Alert Thresholds ──────────────
BASELINE_MIN_SESSIONS: int = int(os.getenv("BASELINE_MIN_SESSIONS", "1"))
ALERT_MILD_ZSCORE: float = float(os.getenv("ALERT_MILD_ZSCORE", "1.5"))
ALERT_MODERATE_ZSCORE: float = float(os.getenv("ALERT_MODERATE_ZSCORE", "2.5"))
ALERT_MAJOR_ZSCORE: float = float(os.getenv("ALERT_MAJOR_ZSCORE", "3.5"))


def get_asr_engine(language: str) -> str:
    lang = (language or PRIMARY_LANG).lower()
    engine = ASR_ENGINE_MAP.get(lang)
    if engine is None:
        raise ValueError(f"No ASR engine configured for language '{language}'.")
    return engine


def get_tts_engine(language: str) -> str:
    lang = (language or PRIMARY_LANG).lower()
    engine = TTS_ENGINE_MAP.get(lang)
    if engine is None:
        raise ValueError(f"No TTS engine configured for language '{language}'.")
    return engine


def validate_config() -> list[str]:
    """Return a list of missing required config values."""
    missing = []
    if not GEMINI_API_KEY or GEMINI_API_KEY == "your_gemini_api_key_here":
        missing.append("GEMINI_API_KEY")
    if not HF_TOKEN or HF_TOKEN == "your_huggingface_token_here":
        missing.append("HF_TOKEN")
    return missing
