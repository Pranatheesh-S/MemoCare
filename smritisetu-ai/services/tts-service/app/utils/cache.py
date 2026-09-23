"""
Dynamic audio cache.

"Good morning" is said many times a day. Generating it once and replaying it is
the difference between narration that answers immediately and narration the
patient waits for.

Cached entries expire with the same retention window as the files themselves, so
nothing personal is kept indefinitely.
"""
from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time
from dataclasses import asdict, dataclass
from pathlib import Path

logger = logging.getLogger("smritisetu.tts")

INDEX_FILENAME = ".cache-index.json"


def normalise(text: str) -> str:
    """Collapses whitespace and case so trivially different spellings share a clip."""
    return re.sub(r"\s+", " ", (text or "").strip()).lower()


def cache_key(text: str, language: str, voice_id: str) -> str:
    """A clip is only reusable for the same words, language and reference voice."""
    digest = hashlib.sha256(f"{voice_id}|{language}|{normalise(text)}".encode()).hexdigest()
    return digest[:32]


@dataclass
class CacheEntry:
    audio_id: str
    duration: float
    created_at: float


class AudioCache:
    """A small persistent map of text hash -> generated clip."""

    def __init__(self, output_dir: Path, max_entries: int = 500, retention_hours: int = 24) -> None:
        self._output_dir = output_dir
        self._max_entries = max(0, max_entries)
        self._retention_seconds = max(0, retention_hours) * 3600
        self._entries: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()
        self._load()

    @property
    def _index_path(self) -> Path:
        return self._output_dir / INDEX_FILENAME

    def _load(self) -> None:
        try:
            raw = json.loads(self._index_path.read_text(encoding="utf-8"))
            self._entries = {
                key: CacheEntry(**value)
                for key, value in raw.items()
                if isinstance(value, dict) and {"audio_id", "duration", "created_at"} <= value.keys()
            }
        except FileNotFoundError:
            self._entries = {}
        except Exception as error:  # noqa: BLE001 — a damaged index is not worth a failed start
            logger.warning("Ignoring an unreadable cache index: %s", error)
            self._entries = {}

    def _save(self) -> None:
        try:
            self._output_dir.mkdir(parents=True, exist_ok=True)
            self._index_path.write_text(
                json.dumps({key: asdict(value) for key, value in self._entries.items()}),
                encoding="utf-8",
            )
        except OSError as error:
            logger.warning("Could not write the cache index: %s", error)

    def _expired(self, entry: CacheEntry, now: float) -> bool:
        return bool(self._retention_seconds) and (now - entry.created_at) > self._retention_seconds

    def get(self, key: str) -> CacheEntry | None:
        """Returns a live entry whose file is still on disk."""
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if self._expired(entry, time.time()) or not (
                self._output_dir / f"{entry.audio_id}.wav"
            ).is_file():
                self._entries.pop(key, None)
                self._save()
                return None
            return entry

    def put(self, key: str, audio_id: str, duration: float) -> None:
        with self._lock:
            self._entries[key] = CacheEntry(audio_id=audio_id, duration=duration, created_at=time.time())
            self._evict_locked()
            self._save()

    def _evict_locked(self) -> None:
        now = time.time()
        for key, entry in list(self._entries.items()):
            if self._expired(entry, now):
                self._entries.pop(key, None)

        overflow = len(self._entries) - self._max_entries
        if self._max_entries and overflow > 0:
            oldest = sorted(self._entries.items(), key=lambda item: item[1].created_at)[:overflow]
            for key, _ in oldest:
                self._entries.pop(key, None)

    def forget_missing(self) -> int:
        """Drops entries whose file the retention sweep has removed."""
        with self._lock:
            before = len(self._entries)
            self._entries = {
                key: entry
                for key, entry in self._entries.items()
                if (self._output_dir / f"{entry.audio_id}.wav").is_file()
            }
            dropped = before - len(self._entries)
            if dropped:
                self._save()
            return dropped

    def size(self) -> int:
        return len(self._entries)
