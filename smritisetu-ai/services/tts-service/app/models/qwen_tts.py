"""
The voice itself: Qwen3-TTS conditioned on one reference recording.

Two things make this fast enough for accessibility narration:

  * the model is loaded **once**, when the service starts, never per sentence;
  * the reference recording is turned into a voice-clone prompt **once** and
    reused for every request, so the recording is never re-analysed.

`TTSProvider` exists so a different engine can replace Qwen later without any
change above this file.
"""
from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import Settings, qwen_language_name
from ..utils.audio import read_wav_info

logger = logging.getLogger("smritisetu.tts")


class TTSUnavailableError(RuntimeError):
    """Raised when speech cannot be generated. Callers fall back; they never crash."""


@dataclass(frozen=True)
class SynthesisResult:
    audio: np.ndarray
    sample_rate: int


class TTSProvider(ABC):
    """The contract the rest of the service depends on."""

    name: str = "provider"

    @abstractmethod
    async def synthesize(self, text: str, language: str = "en") -> SynthesisResult:
        """Generates speech for one chunk of text in the configured voice."""

    async def load(self) -> None:  # pragma: no cover - overridden where there is work to do
        """Prepares the engine. Safe to call more than once."""

    @property
    def ready(self) -> bool:
        return False

    def status(self) -> dict[str, object]:
        return {"provider": self.name, "ready": self.ready}


def detect_device(requested: str) -> str:
    """
    Resolves TTS_DEVICE. `auto` prefers CUDA, then Apple Metal, then the CPU.

    No NVIDIA GPU is assumed anywhere.
    """
    if requested and requested != "auto":
        return requested
    try:
        import torch
    except ImportError:
        return "cpu"

    if torch.cuda.is_available():
        return "cuda:0"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


class QwenTTSProvider(TTSProvider):
    """Voice cloning with Qwen3-TTS."""

    name = "qwen3-tts"

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._model = None
        self._voice_prompt = None
        self._device = "cpu"
        self._reference_text = ""
        self._load_error: str | None = None
        # One inference at a time: concurrent generation on a single GPU (or a
        # laptop's Metal device) contends for memory and makes every caller slower.
        self._inference_lock = asyncio.Lock()
        self._load_lock = asyncio.Lock()

    # ------------------------------------------------------------------ state

    @property
    def ready(self) -> bool:
        return self._model is not None and self._voice_prompt is not None

    @property
    def device(self) -> str:
        return self._device

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def status(self) -> dict[str, object]:
        return {
            "provider": self.name,
            "ready": self.ready,
            "device": self._device,
            "model": self._settings.model_id,
        }

    # ------------------------------------------------------------- reference

    def validate_reference(self) -> list[str]:
        """
        Checks the reference recording before the model is loaded.

        Returns developer-facing problems; an empty list means the voice is
        usable. Never raises: a missing voice must not take down the service.
        """
        problems: list[str] = []
        audio_path = self._settings.reference_audio
        text_path = self._settings.reference_text

        if not audio_path.is_file():
            problems.append(
                f"Reference voice file not found at TTS_REFERENCE_AUDIO ({audio_path}). "
                "See services/tts-service/README.md for how to record and place it."
            )
        if not text_path.is_file():
            problems.append(
                f"Reference transcript not found at TTS_REFERENCE_TEXT ({text_path}). "
                "It must contain the exact words spoken in the recording."
            )
        if problems:
            return problems

        try:
            transcript = text_path.read_text(encoding="utf-8").strip()
        except OSError as error:
            return [f"Reference transcript at {text_path} could not be read: {error}"]
        if not transcript:
            problems.append(f"Reference transcript at {text_path} is empty.")

        if audio_path.suffix.lower() != ".wav":
            problems.append(
                f"Reference voice must be a WAV file; got '{audio_path.suffix}'. "
                "Run scripts/prepare_reference_voice.py to convert it."
            )
        else:
            info = read_wav_info(audio_path)
            if info is None:
                problems.append(f"Reference voice at {audio_path} is not a readable WAV file.")
            else:
                if info.duration_seconds < self._settings.reference_min_seconds:
                    problems.append(
                        f"Reference voice is {info.duration_seconds:.1f}s, shorter than "
                        f"TTS_REF_MIN_SECONDS ({self._settings.reference_min_seconds:.0f}s). "
                        "Around 30–45 seconds of calm, clean speech works best."
                    )
                if info.duration_seconds > self._settings.reference_max_seconds:
                    problems.append(
                        f"Reference voice is {info.duration_seconds:.1f}s, longer than "
                        f"TTS_REF_MAX_SECONDS ({self._settings.reference_max_seconds:.0f}s)."
                    )
        return problems

    # ------------------------------------------------------------------ load

    async def load(self) -> None:
        """Loads the model and builds the voice prompt. Called once at startup."""
        async with self._load_lock:
            if self.ready:
                return
            self._load_error = None

            problems = self.validate_reference()
            if problems:
                self._load_error = problems[0]
                for problem in problems:
                    logger.error("Reference voice: %s", problem)
                return

            try:
                await asyncio.to_thread(self._load_blocking)
            except Exception as error:  # noqa: BLE001 — startup must survive any model failure
                self._model = None
                self._voice_prompt = None
                self._load_error = str(error)
                logger.error("Qwen3-TTS could not be loaded: %s", error)

    def _load_blocking(self) -> None:
        try:
            import torch
            from qwen_tts import Qwen3TTSModel
        except ImportError as error:
            raise TTSUnavailableError(
                "Qwen3-TTS is not installed. Run: pip install -r requirements-model.txt "
                f"({error})"
            ) from error

        self._device = detect_device(self._settings.device)
        logger.info("Loading %s onto %s", self._settings.model_id, self._device)

        kwargs: dict[str, object] = {"device_map": self._device}
        if self._device.startswith("cuda"):
            kwargs["dtype"] = torch.bfloat16
            if _flash_attention_available():
                kwargs["attn_implementation"] = "flash_attention_2"
        elif self._device == "mps":
            # float16 on Metal is numerically unsafe for this model: the
            # generation step's softmax can overflow to inf/nan on Apple's
            # float16 kernels (confirmed on-device). bfloat16 has float32's
            # exponent range — same failure mode avoided — at half the memory
            # of float32, which matters on unified-memory Macs with limited RAM.
            kwargs["dtype"] = torch.bfloat16
        else:
            # CPU bfloat16 kernels are inconsistent across platforms; float32
            # is the safe, well-tested default here.
            kwargs["dtype"] = torch.float32

        started = time.perf_counter()
        self._model = Qwen3TTSModel.from_pretrained(self._settings.model_id, **kwargs)
        logger.info("Model loaded in %.1fs", time.perf_counter() - started)

        self._reference_text = self._settings.reference_text.read_text(encoding="utf-8").strip()
        # Built once. Every later request reuses these features rather than
        # re-reading and re-analysing the recording.
        self._voice_prompt = self._model.create_voice_clone_prompt(
            ref_audio=str(self._settings.reference_audio),
            ref_text=self._reference_text,
            x_vector_only_mode=False,
        )
        logger.info(
            "Reference voice prepared from %s (%d characters of transcript)",
            self._settings.reference_audio.name,
            len(self._reference_text),
        )

    # ------------------------------------------------------------ synthesise

    async def synthesize(self, text: str, language: str = "en") -> SynthesisResult:
        if not self.ready:
            raise TTSUnavailableError(
                self._load_error or "The cloned voice is not loaded."
            )
        cleaned = (text or "").strip()
        if not cleaned:
            raise TTSUnavailableError("There is nothing to say.")

        async with self._inference_lock:
            return await asyncio.to_thread(self._synthesize_blocking, cleaned, language)

    def _synthesize_blocking(self, text: str, language: str) -> SynthesisResult:
        assert self._model is not None  # guarded by `ready`
        try:
            wavs, sample_rate = self._model.generate_voice_clone(
                text=text,
                language=qwen_language_name(language),
                voice_clone_prompt=self._voice_prompt,
                max_new_tokens=_token_budget(text),
            )
        except Exception as error:  # noqa: BLE001 — a failed generation is a fallback, not a crash
            raise TTSUnavailableError(f"Speech generation failed: {error}") from error

        audio = wavs[0] if isinstance(wavs, (list, tuple)) else wavs
        return SynthesisResult(audio=np.asarray(audio, dtype=np.float32), sample_rate=int(sample_rate))


# The codec runs at 12 Hz and speech at roughly 15 characters a second, so a
# sentence needs about 0.8 codec tokens per character. The engine's own default
# is a flat 2048 — nearly three minutes of audio for any request, however short.
# A model that fails to emit its end token then generates for minutes while
# holding the single inference lock, and every other narration in the app waits
# behind it. Budgeting from the text keeps a runaway bounded by the length of
# what was actually asked for.
_TOKENS_PER_CHARACTER = 1.6  # 2x the expected 0.8, so a slow reading still fits
_MIN_TOKEN_BUDGET = 60       # ~5 seconds, so a very short phrase is never clipped
_MAX_TOKEN_BUDGET = 2048     # the engine's own ceiling


def _token_budget(text: str) -> int:
    """A generation ceiling proportional to the text, not a flat three minutes."""
    estimated = int(len(text) * _TOKENS_PER_CHARACTER)
    return max(_MIN_TOKEN_BUDGET, min(estimated, _MAX_TOKEN_BUDGET))


def _flash_attention_available() -> bool:
    try:
        import flash_attn  # noqa: F401
    except ImportError:
        return False
    return True


def build_provider(settings: Settings) -> TTSProvider:
    """The one place a different engine would be swapped in."""
    return QwenTTSProvider(settings)
