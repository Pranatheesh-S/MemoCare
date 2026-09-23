"""
Turning text into speech in the configured voice.

This is the only place that knows a long passage becomes several chunks: callers
ask for a sentence or a paragraph and get one waveform back.
"""
from __future__ import annotations

import logging

import numpy as np

from ..config import Settings
from ..models.qwen_tts import SynthesisResult, TTSProvider, TTSUnavailableError, build_provider
from ..utils.audio import join, trim_trailing_silence
from ..utils.text_chunker import chunk_text

logger = logging.getLogger("smritisetu.tts")


class TextTooLongError(ValueError):
    """The request exceeded TTS_MAX_TEXT_LENGTH."""


class TTSService:
    def __init__(self, settings: Settings, provider: TTSProvider | None = None) -> None:
        self._settings = settings
        self._provider = provider or build_provider(settings)

    @property
    def provider(self) -> TTSProvider:
        return self._provider

    @property
    def ready(self) -> bool:
        return self._settings.enabled and self._provider.ready

    async def start(self) -> None:
        if not self._settings.enabled:
            logger.info("TTS_ENABLED=false — the cloned voice is off; the app uses its own fallback")
            return
        await self._provider.load()

    def validate(self, text: str, language: str) -> str:
        """Checks a client request. Raises on anything the service will not speak."""
        cleaned = (text or "").strip()
        if not cleaned:
            raise ValueError("text must not be empty")
        if len(cleaned) > self._settings.max_text_length:
            raise TextTooLongError(
                f"text is {len(cleaned)} characters; the maximum is {self._settings.max_text_length}"
            )
        if not self._settings.speaks(language):
            raise TTSUnavailableError(
                f"The cloned voice is not configured for '{language}'. "
                f"Configured languages: {', '.join(self._settings.supported_languages)}."
            )
        return cleaned

    async def synthesize(self, text: str, language: str = "en") -> SynthesisResult:
        """Generates one waveform for the whole passage, chunk by chunk."""
        chunks = chunk_text(text, self._settings.chunk_max_chars)
        if not chunks:
            raise TTSUnavailableError("There is nothing to say.")

        pieces: list[np.ndarray] = []
        sample_rate = 0
        for chunk in chunks:
            result = await self._provider.synthesize(chunk, language)
            sample_rate = result.sample_rate
            # Trimmed per chunk, not once at the end: dead air between two
            # sentences is as wrong as dead air after the last one.
            pieces.append(trim_trailing_silence(result.audio, sample_rate))

        if len(pieces) == 1:
            return SynthesisResult(audio=pieces[0], sample_rate=sample_rate)
        return SynthesisResult(audio=join(pieces, sample_rate), sample_rate=sample_rate)

    def health(self) -> dict[str, object]:
        status = self._provider.status()
        return {
            "enabled": self._settings.enabled,
            "modelLoaded": bool(status.get("ready")),
            "referenceVoiceLoaded": self._settings.reference_ready and bool(status.get("ready")),
            "device": status.get("device", "unknown"),
            "provider": status.get("provider", "unknown"),
            "languages": list(self._settings.supported_languages),
            "speechRate": self._settings.speech_rate,
            "fallbackSystemVoice": self._settings.fallback_system_voice,
        }
