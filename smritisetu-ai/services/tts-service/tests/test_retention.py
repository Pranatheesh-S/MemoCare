"""
Retention.

Generated speech can carry a patient's name, so it is swept on a schedule.
Pre-generated accessibility narration is the opposite: it is the app's offline
voice and must survive every sweep.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import pytest

from app.config import Settings
from app.services.dynamic_voice_service import DynamicVoiceService
from app.services.tts_service import TTSService
from app.utils.cache import AudioCache, cache_key, normalise
from app.utils.file_manager import cleanup_expired

from .conftest import FakeProvider


def age(path: Path, hours: float) -> None:
    old = time.time() - hours * 3600
    os.utime(path, (old, old))


@pytest.fixture
def dynamic(voice_settings: Settings) -> DynamicVoiceService:
    return DynamicVoiceService(voice_settings, TTSService(voice_settings, FakeProvider()))


async def test_old_generated_clips_are_removed(
    voice_settings: Settings, dynamic: DynamicVoiceService
) -> None:
    clip = await dynamic.generate("A personalised reminder for Aita.")
    path = dynamic.resolve(clip.audio_id)
    assert path is not None

    age(path, hours=48)
    assert dynamic.sweep() == 1
    assert dynamic.resolve(clip.audio_id) is None


async def test_recent_generated_clips_are_kept(dynamic: DynamicVoiceService) -> None:
    clip = await dynamic.generate("Something said a moment ago.")
    assert dynamic.sweep() == 0
    assert dynamic.resolve(clip.audio_id) is not None


def test_static_voiceovers_are_never_touched_by_the_sweep(voice_settings: Settings) -> None:
    static_clip = voice_settings.static_output_dir / "en" / "common_back.wav"
    static_clip.parent.mkdir(parents=True, exist_ok=True)
    static_clip.write_bytes(b"RIFF....WAVE")
    age(static_clip, hours=24 * 365)

    cleanup_expired(voice_settings.output_dir, voice_settings.retention_hours)

    assert static_clip.is_file(), "pre-generated narration must survive retention"


def test_retention_can_be_switched_off(voice_settings: Settings, tmp_path: Path) -> None:
    clip = voice_settings.output_dir / "keep.wav"
    clip.parent.mkdir(parents=True, exist_ok=True)
    clip.write_bytes(b"RIFF")
    age(clip, hours=1000)

    assert cleanup_expired(voice_settings.output_dir, 0) == 0
    assert clip.is_file()


async def test_the_cache_stops_pointing_at_a_swept_file(
    voice_settings: Settings, dynamic: DynamicVoiceService
) -> None:
    first = await dynamic.generate("Good morning.")
    path = dynamic.resolve(first.audio_id)
    assert path is not None

    age(path, hours=48)
    dynamic.sweep()

    second = await dynamic.generate("Good morning.")
    assert second.cached is False
    assert second.audio_id != first.audio_id


def test_cache_keys_ignore_spacing_and_case_but_not_meaning() -> None:
    assert normalise("  Good   Morning ") == "good morning"
    assert cache_key("Good morning", "en", "v1") == cache_key("  good  MORNING ", "en", "v1")
    assert cache_key("Good morning", "en", "v1") != cache_key("Good evening", "en", "v1")


def test_a_new_reference_voice_invalidates_cached_audio() -> None:
    assert cache_key("Good morning", "en", "my_voice.wav") != cache_key(
        "Good morning", "en", "new_voice.wav"
    )


def test_a_language_gets_its_own_clip() -> None:
    assert cache_key("Hello", "en", "v1") != cache_key("Hello", "de", "v1")


def test_the_cache_does_not_grow_without_limit(tmp_path: Path) -> None:
    cache = AudioCache(tmp_path, max_entries=3, retention_hours=24)
    for index in range(6):
        audio_id = f"0000000{index}-0000-4000-8000-000000000000"
        (tmp_path / f"{audio_id}.wav").write_bytes(b"RIFF")
        cache.put(f"key-{index}", audio_id, 1.0)
    assert cache.size() == 3


def test_the_cache_survives_a_restart(tmp_path: Path) -> None:
    audio_id = "11111111-1111-4111-8111-111111111111"
    (tmp_path / f"{audio_id}.wav").write_bytes(b"RIFF")

    AudioCache(tmp_path).put("key", audio_id, 2.5)
    reopened = AudioCache(tmp_path)

    entry = reopened.get("key")
    assert entry is not None and entry.audio_id == audio_id


def test_a_damaged_cache_index_does_not_stop_the_service(tmp_path: Path) -> None:
    (tmp_path / ".cache-index.json").write_text("{not json", encoding="utf-8")
    assert AudioCache(tmp_path).size() == 0
