"""
Checking the reference voice before it is used.

A problem here is a developer's problem, so it is reported in words a developer
can act on — and it never takes the service down, because the app is expected to
fall back to the device's own voice.
"""
from __future__ import annotations

import dataclasses
import wave
from pathlib import Path

from app.config import Settings
from app.models.qwen_tts import QwenTTSProvider, detect_device


def write_wav(path: Path, seconds: float, sample_rate: int = 24_000) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(b"\x00\x00" * int(sample_rate * seconds))


def test_a_good_reference_voice_passes(voice_settings: Settings) -> None:
    assert QwenTTSProvider(voice_settings).validate_reference() == []


def test_a_missing_recording_names_the_variable_to_set(voice_settings: Settings) -> None:
    voice_settings.reference_audio.unlink()
    problems = QwenTTSProvider(voice_settings).validate_reference()
    assert any("TTS_REFERENCE_AUDIO" in problem for problem in problems)
    assert any("README" in problem for problem in problems)


def test_a_missing_transcript_is_reported_separately(voice_settings: Settings) -> None:
    voice_settings.reference_text.unlink()
    problems = QwenTTSProvider(voice_settings).validate_reference()
    assert any("TTS_REFERENCE_TEXT" in problem for problem in problems)


def test_an_empty_transcript_is_caught(voice_settings: Settings) -> None:
    voice_settings.reference_text.write_text("   \n", encoding="utf-8")
    assert any("empty" in problem for problem in QwenTTSProvider(voice_settings).validate_reference())


def test_a_recording_in_the_wrong_format_suggests_the_converter(
    voice_settings: Settings, tmp_path: Path
) -> None:
    opus = tmp_path / "voices" / "my_voice.opus"
    opus.write_bytes(b"not a wav")
    settings = dataclasses.replace(voice_settings, reference_audio=opus)

    problems = QwenTTSProvider(settings).validate_reference()
    assert any("prepare_reference_voice.py" in problem for problem in problems)


def test_an_unreadable_wav_is_caught(voice_settings: Settings) -> None:
    voice_settings.reference_audio.write_bytes(b"RIFFnot really a wav")
    assert any("readable WAV" in problem for problem in QwenTTSProvider(voice_settings).validate_reference())


def test_a_recording_that_is_too_short_says_how_long_it_should_be(
    voice_settings: Settings,
) -> None:
    write_wav(voice_settings.reference_audio, seconds=2)
    problems = QwenTTSProvider(voice_settings).validate_reference()
    assert any("30–45 seconds" in problem for problem in problems)


def test_a_recording_that_is_too_long_is_reported(voice_settings: Settings) -> None:
    write_wav(voice_settings.reference_audio, seconds=200)
    assert any("TTS_REF_MAX_SECONDS" in problem for problem in QwenTTSProvider(voice_settings).validate_reference())


def test_a_provider_with_no_model_is_simply_not_ready(voice_settings: Settings) -> None:
    provider = QwenTTSProvider(voice_settings)
    assert provider.ready is False
    assert provider.status()["provider"] == "qwen3-tts"


async def test_loading_without_the_model_installed_records_why_and_does_not_raise(
    voice_settings: Settings,
) -> None:
    provider = QwenTTSProvider(voice_settings)
    await provider.load()
    # Either the model stack is absent (the usual case in CI) or it loaded.
    assert provider.ready or provider.load_error


async def test_a_missing_voice_stops_the_load_before_the_model_is_fetched(
    voice_settings: Settings,
) -> None:
    voice_settings.reference_audio.unlink()
    provider = QwenTTSProvider(voice_settings)
    await provider.load()
    assert provider.ready is False
    assert "TTS_REFERENCE_AUDIO" in (provider.load_error or "")


def test_no_gpu_is_assumed() -> None:
    assert detect_device("auto") in {"cpu", "mps", "cuda:0"}
    assert detect_device("cpu") == "cpu"
