#!/usr/bin/env python3
"""
Turn a recording into the reference voice this service speaks in.

Records arrive as whatever the phone produced — .opus, .m4a, .mp3 — at whatever
length. This converts one to the mono WAV the model expects, trims it to a
sensible length, and checks it is actually usable before you spend time
generating two hundred clips with it.

    python scripts/prepare_reference_voice.py --input ~/recording.opus
    python scripts/prepare_reference_voice.py --input ~/recording.opus --start 4 --duration 40
    python scripts/prepare_reference_voice.py --input ~/recording.opus --transcribe

The recording stays on this machine. It is never uploaded, never logged and
never served to a client.
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import settings  # noqa: E402
from app.utils.audio import read_wav_info  # noqa: E402

TARGET_SAMPLE_RATE = 24_000
IDEAL_RANGE = (30.0, 45.0)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, help="The recording to convert (.opus, .m4a, .mp3, .wav …).")
    parser.add_argument(
        "--output",
        default=str(settings.reference_audio),
        help="Where to write the reference WAV (default: TTS_REFERENCE_AUDIO).",
    )
    parser.add_argument("--start", type=float, default=0.0, help="Seconds to skip from the beginning.")
    parser.add_argument(
        "--duration",
        type=float,
        default=45.0,
        help="Seconds to keep (default: %(default)s). 0 keeps everything.",
    )
    parser.add_argument(
        "--transcribe",
        action="store_true",
        help="Draft the transcript with Whisper, if it is installed. Always read it back and correct it.",
    )
    parser.add_argument("--force", action="store_true", help="Overwrite an existing reference voice.")
    return parser.parse_args()


def convert(source: Path, target: Path, start: float, duration: float) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise SystemExit(
            "ffmpeg is required to convert a recording.\n"
            "  macOS:  brew install ffmpeg\n"
            "  Debian: sudo apt install ffmpeg\n"
            "Alternatively export a mono WAV yourself and point TTS_REFERENCE_AUDIO at it."
        )

    target.parent.mkdir(parents=True, exist_ok=True)
    command = [ffmpeg, "-y", "-i", str(source)]
    if start > 0:
        command += ["-ss", str(start)]
    if duration > 0:
        command += ["-t", str(duration)]
    command += [
        "-ac", "1",                       # one voice, one channel
        "-ar", str(TARGET_SAMPLE_RATE),
        "-sample_fmt", "s16",
        "-af", "highpass=f=60,loudnorm=I=-19:TP=-2:LRA=9",  # cut rumble, even out the level
        str(target),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        tail = "\n".join(result.stderr.strip().splitlines()[-6:])
        raise SystemExit(f"ffmpeg could not convert {source}:\n{tail}")


def transcribe(audio: Path, transcript_path: Path) -> bool:
    try:
        import whisper
    except ImportError:
        print("\nWhisper is not installed here, so no transcript was drafted.")
        print(f"Write {transcript_path} by hand: the exact words, as spoken.")
        return False

    print("\nDrafting a transcript with Whisper (this takes a moment)…")
    model = whisper.load_model("base")
    result = model.transcribe(str(audio), fp16=False)
    text = str(result.get("text", "")).strip()
    if not text:
        print("Whisper produced nothing. Write the transcript by hand.")
        return False

    transcript_path.parent.mkdir(parents=True, exist_ok=True)
    transcript_path.write_text(text + "\n", encoding="utf-8")
    print(f"Draft transcript written to {transcript_path}:\n\n  {text}\n")
    print("Read it against the recording and correct it. The closer it matches,")
    print("the closer the cloned voice sounds to you.")
    return True


def main() -> int:
    args = parse_args()
    source = Path(args.input).expanduser()
    target = Path(args.output).expanduser()
    if not target.is_absolute():
        target = (SERVICE_ROOT / target).resolve()

    if not source.is_file():
        raise SystemExit(f"No such recording: {source}")
    if target.exists() and not args.force:
        raise SystemExit(f"{target} already exists. Pass --force to replace it.")

    print(f"Converting {source.name} → {target}")
    convert(source, target, args.start, args.duration)

    info = read_wav_info(target)
    if info is None:
        raise SystemExit(f"{target} was written but is not a readable WAV file.")

    print("\nReference voice")
    print(f"  file        {target}")
    print(f"  duration    {info.duration_seconds:.1f}s")
    print(f"  format      {info.sample_rate} Hz, {info.channels} channel")

    if info.duration_seconds < IDEAL_RANGE[0]:
        print(
            f"  note        shorter than the {IDEAL_RANGE[0]:.0f}–{IDEAL_RANGE[1]:.0f}s that clones best. "
            "It will still work; more calm, varied speech gives a steadier voice."
        )
    elif info.duration_seconds > IDEAL_RANGE[1]:
        print(
            f"  note        longer than {IDEAL_RANGE[1]:.0f}s. That is fine, but trimming to the "
            "calmest, cleanest stretch usually clones better than keeping everything."
        )

    transcript_path = settings.reference_text
    if args.transcribe:
        transcribe(target, transcript_path)
    elif not transcript_path.is_file():
        print(f"\nStill needed: {transcript_path}")
        print("  Write the exact words spoken in the recording, on one or more lines.")
        print("  Re-run with --transcribe to draft it with Whisper instead.")

    print("\nNext:  python scripts/generate_static_voiceovers.py --install-to-app")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
