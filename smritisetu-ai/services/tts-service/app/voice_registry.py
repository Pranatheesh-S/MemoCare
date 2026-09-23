"""
The static voice registry.

Every fixed sentence the app speaks already exists, once, in the app's own
locale files. Copying those sentences into a second list would guarantee the two
drift apart, so the registry is *derived* from `apps/patient-mobile/locales`:
one key, one file, one recording.

A string carrying an interpolation placeholder ("Next: {{title}} at {{time}}")
cannot be pre-generated — it is different every time it is spoken — so it is
excluded here and generated at runtime instead.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

PLACEHOLDER = re.compile(r"\{\{.*?\}\}")
NON_WORD = re.compile(r"[^a-z0-9]+")

# The categories a caller can regenerate on their own, mapped onto the key
# prefixes the app actually uses.
CATEGORY_PREFIXES: dict[str, tuple[str, ...]] = {
    "common": ("common", "app"),
    "onboarding": ("splash", "pairing", "profile"),
    "home": ("home",),
    "games": (
        "games",
        "memoryMatch",
        "routineBuilder",
        "whoIsThis",
        "memoryLane",
        "storyRecall",
    ),
    "reminders": ("myDay",),
    "memories": ("memories",),
    "help": ("help", "callFamily"),
    "chatbot": ("companion",),
    "settings": ("settings", "sync"),
    "errors": ("errors",),
}

# Strings that are shown but never spoken. Generating them would cost inference
# time and disk for audio nothing ever plays.
NEVER_SPOKEN = {
    "app.name",
    "app.tagline",
    "memories.category.MY_FAMILY",
    "memories.category.MY_HOME",
    "memories.category.MY_FESTIVALS",
    "memories.category.MY_PLACES",
    "memories.category.MY_SONGS",
    "memories.category.HAPPY_MOMENTS",
}

# Marks a locale file whose strings are awaiting native-speaker review.
PLACEHOLDER_MARKER = "PLACEHOLDER_PENDING_NATIVE_REVIEW"


@dataclass(frozen=True)
class VoiceEntry:
    key: str
    text: str
    category: str
    filename: str

    @property
    def text_hash(self) -> str:
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()[:16]


def slugify(key: str) -> str:
    """`memoryMatch.instruction` -> `memorymatch_instruction`. Deterministic and stable."""
    return NON_WORD.sub("_", key.lower()).strip("_")


def category_for(key: str) -> str:
    prefix = key.split(".", 1)[0]
    for category, prefixes in CATEGORY_PREFIXES.items():
        if prefix in prefixes:
            return category
    return "other"


def is_static(key: str, text: str) -> bool:
    """A sentence can be pre-generated when it never changes and is actually spoken."""
    if key in NEVER_SPOKEN:
        return False
    if not text or not text.strip():
        return False
    if PLACEHOLDER.search(text):
        return False
    if PLACEHOLDER_MARKER in text:
        return False
    return True


def load_locale(locales_dir: Path, language: str) -> dict[str, str]:
    path = locales_dir / f"{language}.json"
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise FileNotFoundError(
            f"No locale file for '{language}' at {path}. "
            "Set TTS_LOCALES_DIR to the app's locales directory."
        ) from error
    return {key: value for key, value in raw.items() if isinstance(value, str)}


def build_registry(
    locales_dir: Path,
    language: str = "en",
    categories: tuple[str, ...] | None = None,
    extra_phrases: dict[str, str] | None = None,
) -> dict[str, VoiceEntry]:
    """
    Builds the key -> entry map for one language.

    `extra_phrases` carries finite content that does not live in the locale
    files — the familiar objects of a regional pack, for instance — so a known,
    countable set of prompts is pre-generated rather than synthesised at play time.
    """
    strings = dict(load_locale(locales_dir, language))
    for key, text in (extra_phrases or {}).items():
        strings.setdefault(key, text)

    registry: dict[str, VoiceEntry] = {}
    for key, text in strings.items():
        if not is_static(key, text):
            continue
        category = category_for(key)
        if categories and category not in categories:
            continue
        registry[key] = VoiceEntry(
            key=key,
            text=text.strip(),
            category=category,
            filename=f"{slugify(key)}.wav",
        )
    return dict(sorted(registry.items()))


def dynamic_keys(locales_dir: Path, language: str = "en") -> list[str]:
    """Keys that must be spoken at runtime because their text is interpolated."""
    return sorted(
        key
        for key, text in load_locale(locales_dir, language).items()
        if PLACEHOLDER.search(text or "")
    )
