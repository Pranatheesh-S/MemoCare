"""
asr.py – Speech-to-text using Whisper (local, CPU-friendly).

Returns transcript + acoustic timing metadata for feature extraction.
"""
from __future__ import annotations
import io
import time
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import sounddevice as sd
import soundfile as sf
import whisper

from backend.config import WHISPER_MODEL, HF_TOKEN, get_asr_engine, ASR_MODEL_ID, HF_CACHE_DIR

# Load model once (downloaded to ~/.cache/whisper automatically)
import os
import shutil

try:
    import imageio_ffmpeg
    _ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    _ffmpeg_dir = os.path.dirname(_ffmpeg_exe)
    _target_exe = os.path.join(_ffmpeg_dir, "ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if not os.path.exists(_target_exe):
        try:
            shutil.copyfile(_ffmpeg_exe, _target_exe)
        except Exception:
            pass
    if _ffmpeg_dir not in os.environ.get("PATH", ""):
        os.environ["PATH"] = _ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
except Exception as _e:
    print(f"[ASR] ffmpeg discovery: {_e}")

os.environ["HF_TOKEN"] = HF_TOKEN  # needed for gated HF models
_whisper_model: whisper.Whisper | None = None
_indicconformer_model = None


def _get_model() -> whisper.Whisper:
    global _whisper_model
    if _whisper_model is None:
        print(f"[ASR] Loading Whisper model '{WHISPER_MODEL}' (first run may download ~142 MB) …")
        _whisper_model = whisper.load_model(WHISPER_MODEL)
        print("[ASR] Model loaded.")
    return _whisper_model


def _get_indicconformer():
    global _indicconformer_model
    if _indicconformer_model is None:
        try:
            from transformers import AutoModel
        except Exception as exc:  # pragma: no cover - optional dependency path
            raise ImportError("transformers is required for IndicConformer ASR.") from exc
        print(f"[ASR] Loading IndicConformer model '{ASR_MODEL_ID}' …")
        _indicconformer_model = AutoModel.from_pretrained(
            ASR_MODEL_ID,
            trust_remote_code=True,
            cache_dir=HF_CACHE_DIR or None,
        )
        _indicconformer_model.eval()
    return _indicconformer_model


@dataclass
class ASRResult:
    transcript: str
    language_detected: str
    audio_duration_s: float
    word_count: int
    words_per_minute: float
    pause_durations_s: list[float] = field(default_factory=list)
    mean_pause_s: float = 0.0


def _transcribe_indicconformer(audio_path: str | Path, language: str | None = None) -> ASRResult:
    import torch
    import torchaudio

    lang = (language or "en").lower()
    model = _get_indicconformer()
    wav, sr = torchaudio.load(str(audio_path))
    if sr != 16000:
        wav = torchaudio.functional.resample(wav, sr, 16000)
    wav = wav.mean(dim=0, keepdim=True)
    duration_s = wav.shape[-1] / 16000

    with torch.no_grad():
        result = model(wav, lang, "ctc")

    if isinstance(result, dict):
        transcript = str(result.get("text") or result.get("transcript") or "").strip()
        segments = result.get("segments", []) or []
    elif hasattr(result, "timestamps") or hasattr(result, "segments"):
        transcript = str(getattr(result, "text", getattr(result, "transcript", ""))).strip()
        segments = getattr(result, "segments", []) or []
    else:
        transcript = str(result).strip()
        segments = []

    pause_durations: list[float] = []
    if segments and hasattr(segments[0], "__getitem__"):
        for i, seg in enumerate(segments):
            if i == 0:
                continue
            prev_end = segments[i - 1].get("end", 0.0)
            gap = seg.get("start", 0.0) - prev_end
            if gap > 0.2:
                pause_durations.append(round(float(gap), 3))

    word_count = len(transcript.split())
    wpm = (word_count / duration_s * 60) if duration_s > 0 else 0.0
    mean_pause = float(np.mean(pause_durations)) if pause_durations else 0.0

    return ASRResult(
        transcript=transcript,
        language_detected=lang,
        audio_duration_s=round(duration_s, 2),
        word_count=word_count,
        words_per_minute=round(wpm, 1),
        pause_durations_s=pause_durations,
        mean_pause_s=round(mean_pause, 3),
    )


def _transcribe_whisper(audio_path: str | Path, language: str | None = None) -> ASRResult:
    model = _get_model()
    try:
        result = model.transcribe(
            str(audio_path),
            word_timestamps=True,
            fp16=False,
            language=language,
        )
    except Exception as err:
        print(f"[ASR] Direct whisper file transcription fallback due to: {err}")
        try:
            import librosa
            audio_arr, _ = librosa.load(str(audio_path), sr=16000, mono=True)
            result = model.transcribe(
                audio_arr.astype(np.float32),
                word_timestamps=True,
                fp16=False,
                language=language,
            )
        except Exception as err2:
            print(f"[ASR] Librosa loading fallback error: {err2}")
            raise err

    transcript = result["text"].strip()
    lang = result.get("language", "unknown")

    segments = result.get("segments", [])
    pause_durations = []
    total_audio_s = 0.0

    for i, seg in enumerate(segments):
        total_audio_s = max(total_audio_s, seg["end"])
        if i > 0:
            gap = seg["start"] - segments[i - 1]["end"]
            if gap > 0.2:
                pause_durations.append(round(gap, 3))

    word_count = len(transcript.split())
    wpm = (word_count / total_audio_s * 60) if total_audio_s > 0 else 0.0
    mean_pause = float(np.mean(pause_durations)) if pause_durations else 0.0

    return ASRResult(
        transcript=transcript,
        language_detected=lang,
        audio_duration_s=round(total_audio_s, 2),
        word_count=word_count,
        words_per_minute=round(wpm, 1),
        pause_durations_s=pause_durations,
        mean_pause_s=round(mean_pause, 3),
    )


def transcribe_file(audio_path: str | Path, language: str | None = None) -> ASRResult:
    """Transcribe a pre-recorded audio file."""
    lang = (language or "en").lower()
    engine = get_asr_engine(lang)

    if engine == "indicconformer":
        return _transcribe_indicconformer(audio_path, lang)
    if engine == "whisper":
        return _transcribe_whisper(audio_path, lang)
    raise ValueError(f"Unsupported ASR engine '{engine}' for language '{lang}'.")


def record_and_transcribe(
    duration_s: int = 30,
    sample_rate: int = 16000,
    language: str | None = None,
) -> tuple[ASRResult, bytes]:
    """
    Record from the default microphone for `duration_s` seconds,
    then transcribe. Returns (ASRResult, raw_wav_bytes).
    """
    print(f"[ASR] Recording for {duration_s} seconds …")
    audio = sd.rec(
        int(duration_s * sample_rate),
        samplerate=sample_rate,
        channels=1,
        dtype="float32",
    )
    sd.wait()
    print("[ASR] Recording complete. Transcribing …")

    # Write to temp WAV, then transcribe
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, audio, sample_rate)
        result = transcribe_file(tmp.name, language=language)
        tmp_path = Path(tmp.name)

    # Return raw bytes for storage
    raw_bytes = tmp_path.read_bytes()
    tmp_path.unlink(missing_ok=True)
    return result, raw_bytes


def record_until_silence(
    silence_threshold: float = 0.01,
    silence_duration_s: float = 2.0,
    max_duration_s: int = 120,
    sample_rate: int = 16000,
    chunk_s: float = 0.5,
    language: str | None = None,
    speech_start_grace_s: float = 5.0,
) -> tuple[ASRResult, bytes]:
    """
    Record from mic until `silence_duration_s` of silence detected.
    Simpler approach for interactive sessions.
    """
    chunk_samples = int(chunk_s * sample_rate)
    frames: list[np.ndarray] = []
    silent_chunks = 0
    speech_detected = False
    required_silent_chunks = int(silence_duration_s / chunk_s)
    grace_chunks = int(speech_start_grace_s / chunk_s)
    max_chunks = int(max_duration_s / chunk_s)

    print("[ASR] Listening … (speak now)")
    with sd.InputStream(samplerate=sample_rate, channels=1, dtype="float32") as stream:
        for i in range(max_chunks):
            chunk, _ = stream.read(chunk_samples)
            frames.append(chunk.copy())
            rms = float(np.sqrt(np.mean(chunk ** 2)))
            
            if rms >= silence_threshold:
                speech_detected = True
                silent_chunks = 0
            else:
                silent_chunks += 1
                
            if speech_detected and silent_chunks >= required_silent_chunks:
                break
            if not speech_detected and i >= grace_chunks:
                break

    audio = np.concatenate(frames, axis=0)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, audio, sample_rate)
        result = transcribe_file(tmp.name, language=language)
        tmp_path = Path(tmp.name)

    raw_bytes = tmp_path.read_bytes()
    tmp_path.unlink(missing_ok=True)
    print(f"[ASR] Heard: {result.transcript!r}")
    return result, raw_bytes
