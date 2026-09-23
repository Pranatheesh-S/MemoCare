"""Runtime configuration for the SmritiSetu AI custom-voice service."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:  # Loading a local .env is a convenience for development only.
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # noqa: BLE001 — the service must start with or without python-dotenv
    pass

SERVICE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = SERVICE_ROOT.parent.parent


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


def _path(name: str, default: str) -> Path:
    raw = os.getenv(name, default).strip() or default
    candidate = Path(raw).expanduser()
    # Relative paths are resolved against the service directory, never the
    # caller's working directory, so a script run from anywhere finds the voice.
    return candidate if candidate.is_absolute() else (SERVICE_ROOT / candidate).resolve()


def _csv(name: str, default: str) -> tuple[str, ...]:
    raw = os.getenv(name, default)
    return tuple(part.strip() for part in raw.split(",") if part.strip())


@dataclass(frozen=True)
class Settings:
    """
    Every value is configurable and no path is hard-coded to a person's machine.

    The reference recording is read from disk by this service alone. A client
    can never name it, reach it, or receive it.
    """

    enabled: bool = field(default_factory=lambda: _bool("TTS_ENABLED", True))
    port: int = field(default_factory=lambda: _int("TTS_PORT", 8100))
    log_level: str = field(default_factory=lambda: os.getenv("TTS_LOG_LEVEL", "info"))

    # --- model ------------------------------------------------------------
    model_id: str = field(
        default_factory=lambda: os.getenv("TTS_MODEL", "Qwen/Qwen3-TTS-12Hz-0.6B-Base")
    )
    device: str = field(default_factory=lambda: os.getenv("TTS_DEVICE", "auto").strip().lower())

    # --- language ---------------------------------------------------------
    language: str = field(default_factory=lambda: os.getenv("TTS_LANGUAGE", "en").strip())
    # Qwen3-TTS speaks Chinese, English, Japanese, Korean, German, French,
    # Russian, Portuguese, Spanish and Italian. The North Eastern languages this
    # app also supports are NOT among them, so they keep the device's own speech
    # engine rather than being mispronounced by a cloned voice.
    supported_languages: tuple[str, ...] = field(
        default_factory=lambda: _csv("TTS_SUPPORTED_LANGUAGES", "en")
    )

    # --- reference voice --------------------------------------------------
    reference_audio: Path = field(
        default_factory=lambda: _path("TTS_REFERENCE_AUDIO", "./voices/my_voice.wav")
    )
    reference_text: Path = field(
        default_factory=lambda: _path("TTS_REFERENCE_TEXT", "./voices/my_voice.txt")
    )
    reference_min_seconds: float = field(default_factory=lambda: _float("TTS_REF_MIN_SECONDS", 5.0))
    reference_max_seconds: float = field(
        default_factory=lambda: _float("TTS_REF_MAX_SECONDS", 120.0)
    )

    # --- output -----------------------------------------------------------
    output_dir: Path = field(default_factory=lambda: _path("TTS_OUTPUT_DIR", "./generated"))
    static_output_dir: Path = field(
        default_factory=lambda: _path("TTS_STATIC_OUTPUT_DIR", "./static_audio")
    )
    retention_hours: int = field(default_factory=lambda: _int("TTS_AUDIO_RETENTION_HOURS", 24))
    cache_max_entries: int = field(default_factory=lambda: _int("TTS_CACHE_MAX_ENTRIES", 500))

    # --- request limits ---------------------------------------------------
    max_text_length: int = field(default_factory=lambda: _int("TTS_MAX_TEXT_LENGTH", 1200))
    chunk_max_chars: int = field(default_factory=lambda: _int("TTS_CHUNK_MAX_CHARS", 240))
    request_timeout_s: float = field(default_factory=lambda: _float("TTS_REQUEST_TIMEOUT_S", 120.0))

    # --- playback advice sent to the client -------------------------------
    # Rate is applied by the player, not by stretching the waveform: stretching
    # a cloned voice degrades it. The calm pace should come from the reference
    # recording itself.
    speech_rate: float = field(default_factory=lambda: _float("TTS_SPEECH_RATE", 1.0))
    autoplay: bool = field(default_factory=lambda: _bool("TTS_AUTOPLAY", True))
    fallback_system_voice: bool = field(
        default_factory=lambda: _bool("TTS_FALLBACK_SYSTEM_VOICE", True)
    )

    # --- security ---------------------------------------------------------
    api_key: str = field(default_factory=lambda: os.getenv("TTS_API_KEY", "").strip())
    cors_origins: tuple[str, ...] = field(default_factory=lambda: _csv("TTS_CORS_ORIGINS", "*"))

    # --- static voice-over generation ------------------------------------
    locales_dir: Path = field(
        default_factory=lambda: _path("TTS_LOCALES_DIR", "../../apps/patient-mobile/locales")
    )
    # Where `generate_static_voiceovers.py --install-to-app` copies the finished
    # clips so the app can bundle them and narrate with no network at all.
    app_voice_dir: Path = field(
        default_factory=lambda: _path(
            "TTS_APP_VOICE_DIR", "../../apps/patient-mobile/assets/voice"
        )
    )

    @property
    def voices_dir(self) -> Path:
        """Where the reference recording lives. Server-side only; never served."""
        return self.reference_audio.parent

    @property
    def reference_ready(self) -> bool:
        return self.reference_audio.is_file() and self.reference_text.is_file()

    def speaks(self, language: str) -> bool:
        """Whether the cloned voice may be used for this language at all."""
        return language.strip().lower() in self.supported_languages


settings = Settings()

SERVICE_VERSION = "1.0.0"
VOICE_ENGINE_VERSION = "qwen3-tts-1.0.0"
MANIFEST_FILENAME = "voice-manifest.json"

# Qwen3-TTS names languages in full rather than by ISO code.
QWEN_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "de": "German",
    "fr": "French",
    "ru": "Russian",
    "pt": "Portuguese",
    "es": "Spanish",
    "it": "Italian",
}


def qwen_language_name(language: str) -> str:
    return QWEN_LANGUAGE_NAMES.get(language.strip().lower(), "English")
