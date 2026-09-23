"""
Shared fixtures.

Everything here runs against a stand-in engine, so the suite exercises caching,
retention, chunking, validation and every failure path without downloading a
model or owning a GPU.
"""
from __future__ import annotations

import dataclasses
import sys
from pathlib import Path

import numpy as np
import pytest

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import Settings, settings as real_settings  # noqa: E402
from app.models.qwen_tts import SynthesisResult, TTSProvider, TTSUnavailableError  # noqa: E402

SAMPLE_RATE = 24_000


class FakeProvider(TTSProvider):
    """A voice that always works — unless a test asks it not to."""

    name = "fake"

    def __init__(self, *, fail: bool = False, ready: bool = True) -> None:
        self._fail = fail
        self._ready = ready
        self.calls: list[tuple[str, str]] = []
        self.loaded = 0

    async def load(self) -> None:
        self.loaded += 1

    @property
    def ready(self) -> bool:
        return self._ready

    def status(self) -> dict[str, object]:
        return {"provider": self.name, "ready": self._ready, "device": "cpu", "model": "fake"}

    async def synthesize(self, text: str, language: str = "en") -> SynthesisResult:
        if self._fail:
            raise TTSUnavailableError("the engine is unwell")
        self.calls.append((text, language))
        # A tenth of a second per word, so duration is predictable in assertions.
        samples = int(SAMPLE_RATE * 0.1 * max(1, len(text.split())))
        return SynthesisResult(audio=np.zeros(samples, dtype=np.float32), sample_rate=SAMPLE_RATE)


@pytest.fixture
def voice_settings(tmp_path: Path) -> Settings:
    """Settings pointed entirely at a temporary directory."""
    reference = tmp_path / "voices" / "my_voice.wav"
    reference.parent.mkdir(parents=True, exist_ok=True)
    transcript = tmp_path / "voices" / "my_voice.txt"
    transcript.write_text("This is a calm reading voice.", encoding="utf-8")

    import wave

    with wave.open(str(reference), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SAMPLE_RATE)
        handle.writeframes(b"\x00\x00" * SAMPLE_RATE * 35)  # 35 seconds

    return dataclasses.replace(
        real_settings,
        enabled=True,
        output_dir=tmp_path / "generated",
        static_output_dir=tmp_path / "static_audio",
        reference_audio=reference,
        reference_text=transcript,
        api_key="",
        supported_languages=("en",),
        max_text_length=200,
        chunk_max_chars=60,
        retention_hours=24,
        cache_max_entries=10,
    )


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest.fixture
def client(voice_settings: Settings, provider: FakeProvider):
    from fastapi.testclient import TestClient

    from app.main import create_app

    with TestClient(create_app(voice_settings, provider)) as test_client:
        yield test_client
