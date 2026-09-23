"""
Pre-generated accessibility narration.

A button label, a screen title or a game instruction never changes, so it is
spoken once into a file and replayed from then on. That is what makes narration
instant, and what lets it keep working with no network and no model loaded.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from ..config import MANIFEST_FILENAME, VOICE_ENGINE_VERSION, Settings
from ..utils.file_manager import static_path

logger = logging.getLogger("smritisetu.tts")

MANIFEST_VERSION = 1


@dataclass(frozen=True)
class ManifestEntry:
    file: str
    hash: str
    duration: float
    category: str

    def as_dict(self) -> dict[str, object]:
        return {
            "file": self.file,
            "hash": self.hash,
            "duration": self.duration,
            "category": self.category,
        }


class StaticVoiceService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @property
    def manifest_path(self) -> Path:
        return self._settings.static_output_dir / MANIFEST_FILENAME

    # ------------------------------------------------------------------ read

    def load(self) -> dict[str, object]:
        """The manifest as written by the generator, or an empty one."""
        try:
            raw = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return self.empty()
        except Exception as error:  # noqa: BLE001 — a damaged manifest degrades, never crashes
            logger.warning("Ignoring an unreadable voice manifest: %s", error)
            return self.empty()
        if not isinstance(raw, dict) or "languages" not in raw:
            return self.empty()
        return raw

    @staticmethod
    def empty() -> dict[str, object]:
        return {
            "version": MANIFEST_VERSION,
            "engine": VOICE_ENGINE_VERSION,
            "voice": None,
            "generatedAt": None,
            "languages": {},
        }

    def entries(self, language: str) -> dict[str, dict[str, object]]:
        languages = self.load().get("languages", {})
        entry = languages.get(language) if isinstance(languages, dict) else None
        return entry if isinstance(entry, dict) else {}

    def flat_map(self, language: str) -> dict[str, str]:
        """`{"home.choose": "en/home_choose.wav"}` — what a client needs and no more."""
        return {
            key: str(value.get("file"))
            for key, value in self.entries(language).items()
            if isinstance(value, dict) and value.get("file")
        }

    def resolve(self, language: str, filename: str) -> Path | None:
        """A static clip on disk. Pattern-checked; a crafted name cannot escape."""
        path = static_path(self._settings.static_output_dir, language, filename)
        if path is None or not path.is_file():
            return None
        return path

    def count(self) -> int:
        languages = self.load().get("languages", {})
        if not isinstance(languages, dict):
            return 0
        return sum(len(entries) for entries in languages.values() if isinstance(entries, dict))

    # ----------------------------------------------------------------- write

    def write(self, language: str, entries: dict[str, ManifestEntry], voice: str) -> Path:
        """
        Merges one language's entries into the manifest.

        Other languages are left untouched, so regenerating English never
        discards clips generated for another language.
        """
        manifest = self.load()
        languages = manifest.get("languages")
        if not isinstance(languages, dict):
            languages = {}
        languages[language] = {key: entry.as_dict() for key, entry in sorted(entries.items())}

        manifest.update(
            {
                "version": MANIFEST_VERSION,
                "engine": VOICE_ENGINE_VERSION,
                "voice": voice,
                "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "languages": languages,
            }
        )

        self.manifest_path.parent.mkdir(parents=True, exist_ok=True)
        self.manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
        return self.manifest_path
