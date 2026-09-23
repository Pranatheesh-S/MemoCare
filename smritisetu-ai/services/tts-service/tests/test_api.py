"""
The HTTP surface, including every way it is allowed to fail.

A failure here must always be something the app can fall back from — never a
crash, and never a path a client could use to reach the reference voice.
"""
from __future__ import annotations

import dataclasses

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

from .conftest import FakeProvider


def test_health_reports_the_voice_without_revealing_where_it_lives(client: TestClient) -> None:
    body = client.get("/tts/health").json()
    assert body["enabled"] is True
    assert body["modelLoaded"] is True
    assert body["referenceVoiceLoaded"] is True
    assert body["device"] == "cpu"
    assert body["languages"] == ["en"]

    serialised = str(body)
    assert "my_voice" not in serialised
    assert "/voices/" not in serialised


def test_container_health_is_separate_and_always_answers(client: TestClient) -> None:
    assert client.get("/health").json()["service"] == "smritisetu-tts-service"


def test_generate_returns_a_playable_url(client: TestClient) -> None:
    body = client.post("/tts/generate", json={"text": "Good morning.", "language": "en"}).json()
    assert body["success"] is True
    assert body["audioUrl"] == f"/tts/audio/{body['id']}.wav"
    assert body["duration"] > 0
    assert body["cached"] is False

    audio = client.get(body["audioUrl"])
    assert audio.status_code == 200
    assert audio.headers["content-type"] == "audio/wav"
    assert audio.content[:4] == b"RIFF"


def test_the_same_words_are_generated_once_and_then_replayed(
    client: TestClient, provider: FakeProvider
) -> None:
    first = client.post("/tts/generate", json={"text": "Good morning."}).json()
    second = client.post("/tts/generate", json={"text": "  good   MORNING.  "}).json()

    assert second["cached"] is True
    assert second["id"] == first["id"]
    assert len(provider.calls) == 1  # the engine ran once, not twice


def test_long_text_is_chunked_before_it_reaches_the_engine(
    client: TestClient, provider: FakeProvider
) -> None:
    reply = (
        "Good morning. Your memory activity is ready for you now. "
        "Would you like to begin, or would you rather rest a little longer?"
    )
    body = client.post("/tts/generate", json={"text": reply}).json()

    assert body["success"] is True
    assert len(provider.calls) > 1
    assert " ".join(text for text, _ in provider.calls).split() == reply.split()


def test_text_beyond_the_limit_is_refused_rather_than_generated(client: TestClient) -> None:
    response = client.post("/tts/generate", json={"text": "a" * 500})
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "TEXT_TOO_LONG"


def test_empty_text_is_refused(client: TestClient) -> None:
    assert client.post("/tts/generate", json={"text": "   "}).status_code == 422


def test_a_language_the_voice_does_not_speak_falls_back_rather_than_mispronouncing(
    client: TestClient,
) -> None:
    """Assamese has no Qwen voice, so the app must use the device engine instead."""
    response = client.post("/tts/generate", json={"text": "নমস্কাৰ", "language": "as"})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "LANGUAGE_UNAVAILABLE"


def test_a_client_cannot_ask_for_a_file_outside_the_generated_directory(client: TestClient) -> None:
    for attempt in ["../../voices/my_voice", "..%2F..%2Fvoices%2Fmy_voice", "my_voice", "1234"]:
        assert client.get(f"/tts/audio/{attempt}").status_code in (404, 400)


def test_a_client_cannot_traverse_out_of_the_static_directory(client: TestClient) -> None:
    assert client.get("/tts/static/en/../../voices/my_voice.wav").status_code in (404, 400)
    assert client.get("/tts/static/..%2F..%2Fvoices/my_voice.wav").status_code in (404, 400)


def test_an_unknown_clip_is_a_clean_404(client: TestClient) -> None:
    missing = "00000000-0000-4000-8000-000000000000"
    assert client.get(f"/tts/audio/{missing}").status_code == 404


def test_the_manifest_lists_pre_generated_keys(client: TestClient) -> None:
    body = client.get("/tts/manifest", params={"language": "en"}).json()
    assert body["language"] == "en"
    assert body["baseUrl"] == "/tts/static"
    assert body["entries"] == {}  # nothing generated in a fresh temporary directory


def test_a_failing_engine_returns_a_fallback_signal_not_a_crash(voice_settings: Settings) -> None:
    with TestClient(create_app(voice_settings, FakeProvider(fail=True))) as client:
        response = client.post("/tts/generate", json={"text": "Good morning."})
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "VOICE_UNAVAILABLE"
        # The service itself is still up and still answering.
        assert client.get("/health").status_code == 200


def test_an_unloaded_model_is_reported_rather_than_guessed_at(voice_settings: Settings) -> None:
    with TestClient(create_app(voice_settings, FakeProvider(ready=False))) as client:
        assert client.get("/tts/health").json()["modelLoaded"] is False
        assert client.post("/tts/generate", json={"text": "Hello."}).status_code == 503


def test_with_tts_disabled_the_service_runs_and_reports_it(voice_settings: Settings) -> None:
    disabled = dataclasses.replace(voice_settings, enabled=False)
    with TestClient(create_app(disabled, FakeProvider())) as client:
        body = client.get("/tts/health").json()
        assert body["enabled"] is False
        assert client.post("/tts/generate", json={"text": "Hello."}).status_code == 503


@pytest.mark.parametrize("header", [{}, {"x-api-key": "wrong"}, {"authorization": "Bearer wrong"}])
def test_an_api_key_is_enforced_when_one_is_configured(
    voice_settings: Settings, header: dict[str, str]
) -> None:
    guarded = dataclasses.replace(voice_settings, api_key="s3cret")
    with TestClient(create_app(guarded, FakeProvider())) as client:
        assert client.post("/tts/generate", json={"text": "Hello."}, headers=header).status_code == 401
        # Health stays open so a monitor can see the service without a key.
        assert client.get("/tts/health").status_code == 200
        assert (
            client.post("/tts/generate", json={"text": "Hello."}, headers={"x-api-key": "s3cret"}).status_code
            == 200
        )
