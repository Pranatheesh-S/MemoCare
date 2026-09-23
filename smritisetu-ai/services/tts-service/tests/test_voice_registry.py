"""
The static registry is derived from the app's own locale files.

These tests hold that boundary: fixed sentences are pre-generated, interpolated
ones are not, and a filename never changes for a key that has not changed.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.config import settings
from app.voice_registry import build_registry, category_for, dynamic_keys, is_static, slugify


@pytest.fixture
def locales(tmp_path: Path) -> Path:
    directory = tmp_path / "locales"
    directory.mkdir()
    (directory / "en.json").write_text(
        json.dumps(
            {
                "common.back": "Back",
                "home.choose": "Whenever you are ready, choose a card.",
                "home.nextRoutine": "Next: {{title}} at {{time}}",
                "games.wellDone": "You did it.",
                "app.name": "SmritiSetu AI",
                "errors.generic": "Something did not work.",
                "memories.category.MY_HOME": "My Home",
            }
        ),
        encoding="utf-8",
    )
    return directory


def test_a_filename_is_deterministic_and_filesystem_safe() -> None:
    assert slugify("memoryMatch.instruction") == "memorymatch_instruction"
    assert slugify("common.back") == "common_back"
    assert slugify("home.greeting.morning") == "home_greeting_morning"


def test_interpolated_text_is_never_pre_generated() -> None:
    assert is_static("home.nextRoutine", "Next: {{title}} at {{time}}") is False
    assert is_static("home.choose", "Choose a card.") is True


def test_strings_shown_but_never_spoken_are_skipped() -> None:
    assert is_static("app.name", "SmritiSetu AI") is False


def test_a_locale_awaiting_review_is_not_recorded() -> None:
    assert is_static("home.choose", "PLACEHOLDER_PENDING_NATIVE_REVIEW") is False


def test_keys_are_grouped_into_categories_a_person_would_regenerate() -> None:
    assert category_for("common.back") == "common"
    assert category_for("memoryMatch.instruction") == "games"
    assert category_for("myDay.done") == "reminders"
    assert category_for("companion.title") == "chatbot"


def test_registry_keeps_fixed_text_and_drops_the_rest(locales: Path) -> None:
    registry = build_registry(locales, "en")
    assert set(registry) == {"common.back", "home.choose", "games.wellDone", "errors.generic"}
    assert registry["common.back"].filename == "common_back.wav"
    assert registry["common.back"].text == "Back"


def test_a_category_filter_generates_only_that_category(locales: Path) -> None:
    registry = build_registry(locales, "en", categories=("home",))
    assert set(registry) == {"home.choose"}


def test_extra_finite_content_can_be_pre_generated_too(locales: Path) -> None:
    registry = build_registry(locales, "en", extra_phrases={"content.assam.jaapi": "Jaapi"})
    assert registry["content.assam.jaapi"].filename == "content_assam_jaapi.wav"


def test_the_text_hash_changes_only_when_the_words_change(locales: Path) -> None:
    first = build_registry(locales, "en")["common.back"]
    (locales / "en.json").write_text(json.dumps({"common.back": "Go back"}), encoding="utf-8")
    second = build_registry(locales, "en")["common.back"]
    assert first.filename == second.filename
    assert first.text_hash != second.text_hash


def test_interpolated_keys_are_reported_as_runtime_work(locales: Path) -> None:
    assert dynamic_keys(locales, "en") == ["home.nextRoutine"]


def test_a_missing_locale_is_a_clear_developer_error(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="TTS_LOCALES_DIR"):
        build_registry(tmp_path, "en")


def test_the_real_app_locales_produce_a_registry() -> None:
    """The service is wired to the actual app, not to a fixture."""
    registry = build_registry(settings.locales_dir, "en")
    assert len(registry) > 100
    assert "common.back" in registry
    assert "home.choose" in registry
    # Nothing interpolated slipped through.
    assert not [entry for entry in registry.values() if "{{" in entry.text]
