"""
WAV reading and writing, using the standard library only.

The API layer must start and serve cached audio on a machine that has never
installed torch, so nothing here may import the model stack.
"""
from __future__ import annotations

import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np

PCM_16_MAX = 32767


@dataclass(frozen=True)
class AudioInfo:
    duration_seconds: float
    sample_rate: int
    channels: int


def to_mono(samples: np.ndarray) -> np.ndarray:
    if samples.ndim == 1:
        return samples
    # (channels, frames) or (frames, channels) — average whichever axis is short.
    axis = 0 if samples.shape[0] < samples.shape[-1] else 1
    return samples.mean(axis=axis)


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> float:
    """Writes 16-bit mono PCM and returns the duration in seconds."""
    mono = to_mono(np.asarray(samples, dtype=np.float32))
    peak = float(np.max(np.abs(mono))) if mono.size else 0.0
    if peak > 1.0:
        mono = mono / peak
    pcm = np.clip(mono * PCM_16_MAX, -PCM_16_MAX - 1, PCM_16_MAX).astype("<i2")

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(sample_rate)
        handle.writeframes(pcm.tobytes())
    return round(len(pcm) / float(sample_rate), 3) if sample_rate else 0.0


def read_wav_info(path: Path) -> AudioInfo | None:
    """Reads duration and format without loading the samples. None if unreadable."""
    try:
        with wave.open(str(path), "rb") as handle:
            frames = handle.getnframes()
            rate = handle.getframerate() or 1
            return AudioInfo(
                duration_seconds=round(frames / float(rate), 3),
                sample_rate=rate,
                channels=handle.getnchannels(),
            )
    except Exception:  # noqa: BLE001 — a malformed file is a validation result, not a crash
        return None


def trim_trailing_silence(
    samples: np.ndarray,
    sample_rate: int,
    keep_seconds: float = 0.25,
    threshold_ratio: float = 0.02,
) -> np.ndarray:
    """
    Removes the dead air a voice-clone model leaves after the words run out.

    The model stops when it emits an end token, and when it does not it keeps
    generating until its token ceiling — usually near-silence with occasional
    low-level artefacts. Played back, that is several seconds of nothing after
    a two-second sentence, which someone waiting to be told what to do reads as
    the app having frozen.

    A short tail is kept so speech never ends abruptly. Level is judged against
    the clip's own peak, so a quiet recording is not mistaken for silence.
    """
    mono = to_mono(np.asarray(samples, dtype=np.float32))
    if mono.size == 0 or sample_rate <= 0:
        return mono

    window = max(1, int(0.02 * sample_rate))
    frames = mono[: (mono.size // window) * window].reshape(-1, window)
    if frames.size == 0:
        return mono

    levels = np.sqrt(np.mean(frames**2, axis=1))
    peak = float(levels.max())
    if peak <= 0.0:
        return mono

    speech = np.flatnonzero(levels > peak * threshold_ratio)
    if speech.size == 0:
        return mono

    end = (int(speech[-1]) + 1) * window + int(keep_seconds * sample_rate)
    return mono[: min(end, mono.size)]


def silence(seconds: float, sample_rate: int) -> np.ndarray:
    return np.zeros(max(0, int(seconds * sample_rate)), dtype=np.float32)


def join(pieces: list[np.ndarray], sample_rate: int, gap_seconds: float = 0.18) -> np.ndarray:
    """
    Joins chunk waveforms with a short breath between them.

    The gap is deliberately small: a long silence between sentences reads as a
    fault to someone who is waiting to be told what to do.
    """
    if not pieces:
        return np.zeros(0, dtype=np.float32)
    gap = silence(gap_seconds, sample_rate)
    joined: list[np.ndarray] = []
    for index, piece in enumerate(pieces):
        if index:
            joined.append(gap)
        joined.append(to_mono(np.asarray(piece, dtype=np.float32)))
    return np.concatenate(joined)
