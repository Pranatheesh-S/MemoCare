"""
Safety guard rails for every response leaving this service.

SmritiSetu AI is a support tool, not a diagnostic platform. This module is the
last line of defence: any explanation that reaches a caregiver is checked for
forbidden clinical language before it is returned, and difficulty movement is
clamped so no rule or model can move a patient more than one level at a time.
"""
from __future__ import annotations

import re

from .config import settings

# Explicitly negated disclaimers are the one thing allowed to mention these
# words, because saying "this is not a diagnosis" is exactly the message this
# service should carry. They are removed before the forbidden scan runs.
ALLOWED_DISCLAIMERS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"this is not a diagnosis\.?",
        r"is not a diagnosis\.?",
        r"not a diagnostic (tool|platform)\.?",
        r"no diagnosis is (made|implied|offered)\.?",
    )
)

# Phrases that must never appear in output, in any casing. Matching is on word
# boundaries so ordinary words ("risky business") do not trip the guard.
FORBIDDEN_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bdementia\b",
        r"\balzheimer'?s?\b",
        r"\bdiagnos(is|e|ed|tic)\b",
        r"\bcondition (has )?(worsen|declin|deteriorat)\w*",
        r"\b(worsening|deteriorating|declining) (condition|health|cognition)\b",
        r"\bhigh[- ]risk\b",
        r"\bcognitive (decline|impairment)\b",
        r"\bmedicine (must|should) be (changed|increased|reduced|stopped)\b",
        r"\bchange (the |their |his |her )?(medication|medicine|dose|dosage)\b",
        r"\bprescri(be|bed|ption)\b",
        r"\bgame over\b",
        r"\b(wrong|failed|failure|poor performance)\b",
        r"\bpatient is (getting )?(worse|unwell|sick)\b",
        r"\bmemory loss\b",
        r"\bdisease\b",
    )
)


class UnsafeOutputError(RuntimeError):
    """Raised when generated text contains forbidden clinical language."""


def _strip_disclaimers(text: str) -> str:
    stripped = text
    for pattern in ALLOWED_DISCLAIMERS:
        stripped = pattern.sub(" ", stripped)
    return stripped


def assert_safe_text(text: str, *, field: str = "explanation") -> str:
    """Returns the text unchanged, or raises if it contains forbidden language."""
    scannable = _strip_disclaimers(text)
    for pattern in FORBIDDEN_PATTERNS:
        match = pattern.search(scannable)
        if match:
            raise UnsafeOutputError(
                f"{field} contains language this service must never produce: {match.group(0)!r}"
            )
    return text


def is_safe_text(text: str) -> bool:
    scannable = _strip_disclaimers(text)
    return all(not pattern.search(scannable) for pattern in FORBIDDEN_PATTERNS)


def clamp_difficulty(value: int) -> int:
    """Keeps difficulty inside the supported range."""
    return max(settings.min_difficulty, min(settings.max_difficulty, int(value)))


def clamp_step(current: int, proposed: int) -> int:
    """
    Difficulty never changes by more than one level at a time.

    This is applied after every rule and after any model signal, so an
    unexpected input can only ever nudge a patient by a single step.
    """
    bounded = clamp_difficulty(proposed)
    current = clamp_difficulty(current)
    if bounded > current + 1:
        return clamp_difficulty(current + 1)
    if bounded < current - 1:
        return clamp_difficulty(current - 1)
    return bounded


def clamp_hint_level(value: int) -> int:
    return max(1, min(settings.max_hint_level, int(value)))
