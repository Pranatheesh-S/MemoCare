#!/usr/bin/env python3
"""
Rebuilds the manifest from WAV files already on disk.

Used after a generation run was interrupted (killed, crashed, machine slept)
before it reached the end and wrote its manifest: the audio is valid and on
disk, but the app doesn't know about it yet, and a fresh run would regenerate
it from scratch. This reconciles the two without touching the model at all.
"""
from __future__ import annotations

import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVICE_ROOT))

from app.config import settings  # noqa: E402
from app.services.static_voice_service import ManifestEntry, StaticVoiceService  # noqa: E402
from app.utils.audio import read_wav_info  # noqa: E402
from app.voice_registry import build_registry  # noqa: E402


def repair(language: str = "en") -> None:
    registry = build_registry(settings.locales_dir, language)
    static_service = StaticVoiceService(settings)
    output_dir = settings.static_output_dir / language

    entries: dict[str, ManifestEntry] = {}
    missing_from_registry = []
    for key, entry in registry.items():
        target = output_dir / entry.filename
        if not target.is_file():
            continue
        info = read_wav_info(target)
        if info is None:
            print(f"  skip (unreadable): {entry.filename}")
            continue
        entries[key] = ManifestEntry(
            file=f"{language}/{entry.filename}",
            hash=entry.text_hash,
            duration=info.duration_seconds,
            category=entry.category,
        )

    for wav in sorted(output_dir.glob("*.wav")):
        if not any(e.file.endswith(wav.name) for e in entries.values()):
            missing_from_registry.append(wav.name)

    manifest_path = static_service.write(language, entries, voice=settings.reference_audio.name)
    print(f"Reconciled {len(entries)} clip(s) into {manifest_path}")
    if missing_from_registry:
        print(f"({len(missing_from_registry)} file(s) on disk have no matching registry key, left alone: "
              f"{missing_from_registry[:5]}{'…' if len(missing_from_registry) > 5 else ''})")


if __name__ == "__main__":
    repair()
