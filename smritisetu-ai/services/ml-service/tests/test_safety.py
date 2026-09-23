"""The safety guard itself: the last line of defence before any response ships."""
from __future__ import annotations

import pytest

from app.config import settings
from app.safety import (
    UnsafeOutputError,
    assert_safe_text,
    clamp_difficulty,
    clamp_hint_level,
    clamp_step,
    is_safe_text,
)


class TestForbiddenLanguage:
    @pytest.mark.parametrize(
        "text",
        [
            "Dementia detected in this patient.",
            "The patient's condition has worsened.",
            "This patient is high-risk.",
            "Medicine must be changed.",
            "Signs of cognitive decline are present.",
            "This is a diagnosis of Alzheimer's.",
            "Game over — you failed.",
            "That answer was wrong.",
            "Poor performance this week.",
            "The patient is getting worse.",
            "Prescribe a higher dose.",
        ],
    )
    def test_forbidden_phrases_are_blocked(self, text):
        assert is_safe_text(text) is False
        with pytest.raises(UnsafeOutputError):
            assert_safe_text(text)

    @pytest.mark.parametrize(
        "text",
        [
            "Good attempt! Let us try together.",
            "You are doing well.",
            "The patient required more hints in five of the last seven comparable sessions. "
            "Caregiver review is suggested.",
            "Caregiver review is suggested. This is not a diagnosis.",
            "Thank you for spending time with us.",
            "The level moves down to 2 with more support.",
        ],
    )
    def test_supportive_phrases_are_allowed(self, text):
        assert is_safe_text(text) is True
        assert assert_safe_text(text) == text

    def test_the_explicit_disclaimer_is_permitted(self):
        # Saying "this is not a diagnosis" is the message the service should
        # carry, so the guard must not block its own disclaimer.
        assert is_safe_text("Caregiver review is suggested. This is not a diagnosis.") is True

    def test_a_disclaimer_does_not_launder_a_forbidden_claim(self):
        text = "Dementia detected. This is not a diagnosis."
        assert is_safe_text(text) is False

    def test_matching_is_case_insensitive(self):
        assert is_safe_text("DEMENTIA DETECTED") is False
        assert is_safe_text("dEmEnTiA detected") is False

    def test_ordinary_words_are_not_false_positives(self):
        assert is_safe_text("The patient completed the activity in good time.") is True
        assert is_safe_text("Participation is steady across the period.") is True


class TestClamping:
    @pytest.mark.parametrize("value,expected", [(-10, 1), (0, 1), (1, 1), (4, 4), (5, 4), (999, 4)])
    def test_difficulty_is_clamped_to_the_supported_range(self, value, expected):
        assert clamp_difficulty(value) == expected

    @pytest.mark.parametrize(
        "current,proposed,expected",
        [
            (2, 4, 3),   # never more than one step up
            (3, 1, 2),   # never more than one step down
            (1, 1, 1),
            (4, 4, 4),
            (1, -5, 1),  # clamped at the minimum
            (4, 99, 4),  # clamped at the maximum
        ],
    )
    def test_difficulty_never_moves_more_than_one_level(self, current, proposed, expected):
        assert clamp_step(current, proposed) == expected

    def test_hint_level_stays_within_range(self):
        assert clamp_hint_level(-3) == 1
        assert clamp_hint_level(0) == 1
        assert clamp_hint_level(99) == settings.max_hint_level
