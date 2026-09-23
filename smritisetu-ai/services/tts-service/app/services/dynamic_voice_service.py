"""
Runtime speech for text that changes: chatbot replies, personalised reminders,
anything with a name or a number in it.

Repeated phrases are cached — "Good morning" is generated once, not once per
morning — and everything generated is swept away on the configured retention
schedule so nothing personal lingers on disk.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from ..config import Settings
from ..utils.audio import write_wav
from ..utils.cache import AudioCache, cache_key
from ..utils.file_manager import cleanup_expired, ensure_directories, generated_path
from .tts_service import TTSService

logger = logging.getLogger("smritisetu.tts")


@dataclass(frozen=True)
class GeneratedClip:
    audio_id: str
    duration: float
    cached: bool


class DynamicVoiceService:
    def __init__(self, settings: Settings, tts: TTSService) -> None:
        self._settings = settings
        self._tts = tts
        ensure_directories(settings.output_dir)
        self._cache = AudioCache(
            settings.output_dir,
            max_entries=settings.cache_max_entries,
            retention_hours=settings.retention_hours,
        )

    @property
    def cache_size(self) -> int:
        return self._cache.size()

    def _voice_id(self) -> str:
        """Cached audio belongs to one reference voice; a new voice invalidates it."""
        return self._settings.reference_audio.name

    async def generate(self, text: str, language: str = "en") -> GeneratedClip:
        key = cache_key(text, language, self._voice_id())
        hit = self._cache.get(key)
        if hit is not None:
            return GeneratedClip(audio_id=hit.audio_id, duration=hit.duration, cached=True)

        result = await self._tts.synthesize(text, language)
        audio_id = str(uuid.uuid4())
        path = generated_path(self._settings.output_dir, audio_id)
        assert path is not None  # a freshly minted UUID always matches
        duration = write_wav(path, result.audio, result.sample_rate)

        self._cache.put(key, audio_id, duration)
        return GeneratedClip(audio_id=audio_id, duration=duration, cached=False)

    def resolve(self, audio_id: str) -> Path | None:
        """The file for a generated id, or None if the id is not a plain UUID."""
        path = generated_path(self._settings.output_dir, audio_id)
        if path is None or not path.is_file():
            return None
        return path

    def sweep(self) -> int:
        """
        Removes expired clips. Static voice-overs live in a different directory
        and are never touched by this.
        """
        removed = cleanup_expired(self._settings.output_dir, self._settings.retention_hours)
        if removed:
            self._cache.forget_missing()
        return removed
