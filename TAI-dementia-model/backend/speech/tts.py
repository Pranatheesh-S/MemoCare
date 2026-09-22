"""
tts.py – Text-to-speech: gTTS (online) with pyttsx3 offline fallback.
"""
from __future__ import annotations
import io
import os
import tempfile
from pathlib import Path
from backend.config import PRIMARY_LANG, get_tts_engine

# Language codes: gTTS accepts 'en', 'hi', 'as', 'bn'
_GTTS_LANG_MAP = {
    "en": "en",
    "hi": "hi",
    "as": "as",   # Assamese – gTTS has partial support
    "bn": "bn",
    "ta": "ta",
}


def _play_audio(path: str) -> None:
    """Play an audio file using pygame (cross-platform)."""
    try:
        import pygame
        pygame.mixer.init()
        pygame.mixer.music.load(path)
        pygame.mixer.music.play()
        while pygame.mixer.music.get_busy():
            pygame.time.Clock().tick(10)
        pygame.mixer.quit()
    except Exception:
        # Fallback: try OS default player
        os.startfile(path) if os.name == "nt" else os.system(f"aplay {path}")


def speak_gtts(text: str, lang: str | None = None) -> bool:
    """
    Speak text via gTTS (requires internet).
    Returns True on success, False on failure.
    """
    try:
        from gtts import gTTS
        tts_lang = _GTTS_LANG_MAP.get(lang or PRIMARY_LANG, "en")
        tts = gTTS(text=text, lang=tts_lang, slow=True)  # slow=True for clarity
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tts.save(tmp.name)
            tmp_path = tmp.name
        _play_audio(tmp_path)
        Path(tmp_path).unlink(missing_ok=True)
        return True
    except Exception as e:
        print(f"[TTS] gTTS failed ({e}), falling back to pyttsx3.")
        return False


def speak_offline(text: str, lang: str | None = None) -> None:
    """
    Speak text via pyttsx3 (fully offline).
    Limited language support — best for English.
    """
    try:
        import pyttsx3
        engine = pyttsx3.init()
        if lang == "ta":
            voices = engine.getProperty("voices")
            ta_voice = next((v.id for v in voices if "ta" in (v.languages or []) or "tamil" in v.name.lower()), None)
            if ta_voice:
                engine.setProperty("voice", ta_voice)
            else:
                print("[TTS] No Tamil voice found on this system — offline fallback will be poor quality for Tamil.")
        engine.setProperty("rate", 140)   # slower than default for clarity
        engine.setProperty("volume", 0.9)
        engine.say(text)
        engine.runAndWait()
    except Exception as e:
        print(f"[TTS] pyttsx3 also failed: {e}. Printing instead.")
        print(f"[COMPANION]: {text}")


def synthesize(text: str, lang: str | None = None) -> bytes:
    """Return raw audio bytes for a server-side TTS response."""
    lang = (lang or PRIMARY_LANG).lower()
    engine = get_tts_engine(lang)

    if engine == "gtts":
        from gtts import gTTS
        tts_lang = _GTTS_LANG_MAP.get(lang, "en")
        buf = io.BytesIO()
        gTTS(text=text, lang=tts_lang, slow=True).write_to_fp(buf)
        return buf.getvalue()

    if engine == "indic_parler":
        try:
            from transformers import AutoModel, AutoTokenizer
        except Exception as exc:  # pragma: no cover - optional model path
            raise ImportError("transformers is required for Indic Parler TTS.") from exc

        model = AutoModel.from_pretrained("ai4bharat/indic-parler-tts")
        tokenizer = AutoTokenizer.from_pretrained("ai4bharat/indic-parler-tts")
        inputs = tokenizer(text, return_tensors="pt")
        audio = model.generate(**inputs)
        return audio.cpu().numpy().tobytes()

    raise ValueError(f"Unsupported TTS engine '{engine}' for language '{lang}'.")


def speak(text: str, lang: str | None = None) -> None:
    """
    Primary TTS entry point.
    Tries gTTS first; falls back to pyttsx3 offline.
    """
    lang = (lang or PRIMARY_LANG).lower()
    if not speak_gtts(text, lang):
        speak_offline(text, lang)
