"""
Where generated audio lives, and when it is removed.

Two rules hold everywhere in this module:
  * a client identifier is a UUID and nothing else, so no request can ever name
    a path outside the generated directory;
  * cleanup only ever touches the generated directory. Pre-generated static
    voice-overs are the app's offline accessibility narration and are never
    deleted by retention.
"""
from __future__ import annotations

import logging
import re
import time
from pathlib import Path

logger = logging.getLogger("smritisetu.tts")

UUID_PATTERN = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
STATIC_NAME_PATTERN = re.compile(r"^[a-z0-9_]+\.wav$")
LANGUAGE_PATTERN = re.compile(r"^[a-z]{2,3}$")


def ensure_directories(*directories: Path) -> None:
    for directory in directories:
        directory.mkdir(parents=True, exist_ok=True)


def generated_path(output_dir: Path, audio_id: str) -> Path | None:
    """Resolves a generated clip. None when the id is not a plain UUID."""
    if not UUID_PATTERN.match(audio_id or ""):
        return None
    return output_dir / f"{audio_id}.wav"


def static_path(static_dir: Path, language: str, filename: str) -> Path | None:
    """
    Resolves a pre-generated clip from `<static_dir>/<language>/<filename>`.

    Both segments are pattern-checked rather than sanitised, so "..", absolute
    paths and symlink names simply do not match.
    """
    if not LANGUAGE_PATTERN.match(language or "") or not STATIC_NAME_PATTERN.match(filename or ""):
        return None
    candidate = static_dir / language / filename
    try:
        resolved = candidate.resolve()
        resolved.relative_to(static_dir.resolve())
    except (ValueError, OSError):
        return None
    return resolved


def cleanup_expired(output_dir: Path, retention_hours: int) -> int:
    """
    Deletes generated clips older than the retention window.

    Returns the number removed. A retention of 0 or less disables cleanup.
    """
    if retention_hours <= 0 or not output_dir.is_dir():
        return 0

    cutoff = time.time() - (retention_hours * 3600)
    removed = 0
    for candidate in output_dir.glob("*.wav"):
        try:
            if candidate.stat().st_mtime < cutoff:
                candidate.unlink()
                removed += 1
        except OSError as error:
            logger.warning("Could not remove an expired clip: %s", error)
    if removed:
        logger.info("Removed %d generated clip(s) older than %dh", removed, retention_hours)
    return removed
