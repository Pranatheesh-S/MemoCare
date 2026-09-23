"""
A very small Gemini client for the session planner.

It uses only the standard library, so the FastAPI service gains no new runtime
dependency and stays importable offline. Every failure mode — no key, timeout,
non-200, malformed JSON, safety block on the far side — returns ``None`` and the
caller falls back to the deterministic rule-based plan.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request

from ..config import GEMINI_PLANNER_VERSION, settings

logger = logging.getLogger(__name__)

# Gemini structured-output schema for the *tunable* fields only. The signals and
# every safety-critical clamp are applied by the planner afterwards; Gemini is
# never trusted to bound its own answer.
RESPONSE_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "recommended_game_type": {
            "type": "string",
            "enum": ["MEMORY_MATCH", "MARKET_MEMORY", "WHO_IS_THIS", "ROUTINE_BUILDER", "MEMORY_LANE"],
        },
        "difficulty": {"type": "integer"},
        "item_count": {"type": "integer"},
        "question_count": {"type": "integer"},
        "preview_seconds": {"type": "integer"},
        "hint_level": {"type": "integer"},
        "hint_modality": {"type": "string", "enum": ["VISUAL", "VOICE", "BOTH"]},
        "session_length": {"type": "string", "enum": ["SHORT", "STANDARD"]},
        "end_with_calm_activity": {"type": "boolean"},
        "content_preference": {"type": "string", "enum": ["FAMILIAR", "STANDARD"]},
        "explanation": {"type": "string"},
    },
    "required": [
        "recommended_game_type",
        "difficulty",
        "item_count",
        "question_count",
        "preview_seconds",
        "hint_level",
        "hint_modality",
        "session_length",
        "end_with_calm_activity",
        "content_preference",
        "explanation",
    ],
}

SYSTEM_PROMPT = (
    "You tune the next single activity for one elderly person using a memory-support "
    "app. You are given that person's own recent play history as structured signals, "
    "plus a deterministic baseline plan.\n\n"
    "Your job is to make the next few minutes comfortable and engaging, not to push "
    "the hardest level. Rules you must follow:\n"
    "- Never increase 'difficulty' above the baseline plan's difficulty. You may lower "
    "or keep it.\n"
    "- Never lower 'hint_level' below the baseline plan's hint_level. You may raise it.\n"
    "- If the signals show fatigue, repeated difficulty, recent abandonment, or an "
    "unusual recent session, prefer: fewer items, more preview time, a shorter "
    "session, familiar content, a voice hint, and ending with the calm activity.\n"
    "- If things are going smoothly and nothing is concerning, a STANDARD plan at the "
    "baseline difficulty is the right answer.\n"
    "- 'explanation' is one or two plain sentences a caregiver could read. It must "
    "never mention dementia, diagnosis, decline, medicines, or words like 'wrong' or "
    "'failed'. Describe the plan, warmly.\n"
    "Return only the JSON object described by the schema."
)


def refine_plan(payload: dict) -> dict | None:
    """
    Ask Gemini to refine the baseline plan. Returns the parsed tunable-fields
    dict, or ``None`` on any problem at all.
    """
    if not settings.gemini_ready:
        return None

    url = f"{settings.gemini_base_url}/models/{settings.gemini_model}:generateContent"
    key = settings.gemini_api_key
    # The generativelanguage endpoint authenticates with an API key, not a
    # bearer token: `x-goog-api-key` works for both AI Studio "AIza..." keys and
    # the shorter project keys. `?key=` is kept as a belt-and-braces fallback.
    headers = {"Content-Type": "application/json", "x-goog-api-key": key}
    if key.startswith("AIza"):
        url = f"{url}?key={key}"

    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps(payload, default=str)}]}],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json",
            "responseSchema": RESPONSE_SCHEMA,
        },
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers=headers,
    )

    try:
        with urllib.request.urlopen(request, timeout=settings.gemini_timeout_ms / 1000) as response:
            raw = response.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        logger.warning("Gemini planner unavailable, using the rule-based plan: %s", error)
        return None

    try:
        envelope = json.loads(raw)
        text = envelope["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
    except (KeyError, IndexError, ValueError, TypeError) as error:
        logger.warning("Gemini planner returned an unusable response: %s", error)
        return None

    if not isinstance(parsed, dict):
        return None
    return parsed


PLANNER_VERSION = GEMINI_PLANNER_VERSION
