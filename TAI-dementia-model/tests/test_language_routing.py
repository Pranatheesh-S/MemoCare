import pytest

from backend.config import get_asr_engine, get_tts_engine
from backend.speech.asr import transcribe_file


def test_supported_ai4bharat_language_routing():
    assert get_asr_engine("as") == "indicconformer"
    assert get_asr_engine("ta") == "indicconformer"
    assert get_asr_engine("hi") == "indicconformer"
    assert get_tts_engine("ta") == "indic_parler"
    assert get_tts_engine("as") == "indic_parler"


def test_unsupported_language_raises():
    with pytest.raises(ValueError, match="No ASR engine configured"):
        get_asr_engine("fr")

    with pytest.raises(ValueError, match="No TTS engine configured"):
        get_tts_engine("fr")

    with pytest.raises(ValueError):
        transcribe_file("test.wav", language="fr")
