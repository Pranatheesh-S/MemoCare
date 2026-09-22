"""
engine.py – Gemini 1.5 Flash conversation engine with dementia-aware persona.
"""
from __future__ import annotations
import json
import time
from typing import Generator

import google.generativeai as genai

from backend.config import GEMINI_API_KEY
from backend.conversation.prompts import (
    get_persona,
    MEMORY_LANE_SYSTEM, MEMORY_LANE_PROMPTS,
    STORY_SYSTEM, STORY_STARTERS,
    WHO_IS_THIS_SYSTEM, who_is_this_prompt,
    ROUTINE_SYSTEM, ROUTINE_PROMPTS,
    alert_explanation_prompt,
)
# Configure Gemini once at import time.
#
# transport="rest": the default gRPC transport opens an HTTP/2 stream to
# generativelanguage.googleapis.com, which many corporate proxies silently
# stall — the call then blocks indefinitely with no error (a stuck
# grpc._channel._blocking, below api-core's own timeout). Plain HTTPS/REST goes
# through the proxy cleanly and honours request_options["timeout"].
genai.configure(api_key=GEMINI_API_KEY, transport="rest")
_MODEL_NAME = "gemini-3.5-flash-lite"

GenerationConfig = genai.types.GenerationConfig

# Every Gemini call gets a hard wall-clock cap. Without it a stuck gRPC stream
# (or api-core retrying a 429/503 with backoff) blocks the caller forever, and
# since the FastAPI routes call these synchronously it wedges the whole server —
# even /api/health stops responding. 12s is enough for a 1-2 sentence reply and
# keeps the trend-check loop's worst case bounded when a call does stall.
_REQUEST_OPTS = {"timeout": 12}


def _make_model(system_instruction: str, model_name: str = _MODEL_NAME) -> genai.GenerativeModel:
    return genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_instruction,
        generation_config=GenerationConfig(
            temperature=0.7,
            max_output_tokens=150,   # keep responses short — 1-2 sentences
            top_p=0.9,
        ),
    )


class ConversationSession:
    """
    Holds one interactive session with a user for a specific flow.
    Maintains Gemini multi-turn history.
    """

    FLOW_TYPES = ("memory_lane", "story_completion", "who_is_this", "routine_chat")

    def __init__(
        self,
        user_name: str,
        flow_type: str,
        lang: str = "en",
        *,
        # For who_is_this
        family_member_name: str = "",
        family_member_relation: str = "",
        family_member_notes: str = "",
        # For routine_chat
        time_of_day: str = "morning",
        # Story starter index
        starter_index: int = 0,
    ):
        assert flow_type in self.FLOW_TYPES, f"Unknown flow: {flow_type}"
        self.user_name = user_name
        self.flow_type = flow_type
        self.lang = lang
        self.history: list[dict] = []      # {role, text, timestamp}
        self.start_time = time.time()

        # Select system prompt + opening line
        system_prompt, opening = self._build_system_and_opening(
            flow_type, lang,
            family_member_name=family_member_name,
            family_member_relation=family_member_relation,
            family_member_notes=family_member_notes,
            time_of_day=time_of_day,
            starter_index=starter_index,
        )
        self.system_prompt = system_prompt
        self._model = _make_model(system_prompt)
        self._chat = self._model.start_chat(history=[])
        self.opening_line = opening.replace("{name}", user_name)

    def _build_system_and_opening(
        self, flow_type, lang, **kwargs
    ) -> tuple[str, str]:
        
        def _with_lang_directive(sys_prompt: str, lang: str) -> str:
            return sys_prompt + f"\n[CRITICAL] You must reply exclusively in the language code '{lang}'."
        
        if flow_type == "memory_lane":
            idx = kwargs.get("starter_index", 0)
            prompts = MEMORY_LANE_PROMPTS.get(lang, MEMORY_LANE_PROMPTS["en"])
            opening = prompts[idx % len(prompts)]
            sys_prompt = MEMORY_LANE_SYSTEM.get(lang, MEMORY_LANE_SYSTEM["en"])
            return _with_lang_directive(sys_prompt, lang), opening

        elif flow_type == "story_completion":
            idx = kwargs.get("starter_index", 0)
            starters = STORY_STARTERS.get(lang, STORY_STARTERS["en"])
            opening = starters[idx % len(starters)]
            sys_prompt = STORY_SYSTEM.get(lang, STORY_SYSTEM["en"])
            return _with_lang_directive(sys_prompt, lang), opening

        elif flow_type == "who_is_this":
            opening = who_is_this_prompt(
                name=kwargs.get("family_member_name", "your loved one"),
                relation=kwargs.get("family_member_relation", "family member"),
                notes=kwargs.get("family_member_notes", ""),
                lang=lang,
            )
            sys_prompt = WHO_IS_THIS_SYSTEM.get(lang, WHO_IS_THIS_SYSTEM["en"])
            return _with_lang_directive(sys_prompt, lang), opening

        elif flow_type == "routine_chat":
            tod = kwargs.get("time_of_day", "morning")
            tod_prompts = ROUTINE_PROMPTS.get(lang, ROUTINE_PROMPTS["en"]).get(tod, ["Hello!"])
            opening = tod_prompts[0]
            sys_prompt = ROUTINE_SYSTEM.get(lang, ROUTINE_SYSTEM["en"])
            return _with_lang_directive(sys_prompt, lang), opening

        sys_prompt = get_persona(lang)
        return _with_lang_directive(sys_prompt, lang), "Hello!"

    # ── Public API ────────────────────────────────────────────────────

    def send(self, user_text: str) -> str:
        """Send elder's text; return assistant response."""
        t0 = time.time()
        assistant_text = ""
        try:
            response = self._chat.send_message(user_text, request_options=_REQUEST_OPTS)
            assistant_text = response.text.strip()
        except Exception as e:
            print(f"[ConversationSession] Primary model error: {e}, attempting fallback models...")
            for alt_name in ["gemini-3.5-flash", "gemini-flash-latest", "gemini-pro-latest"]:
                try:
                    alt_model = _make_model(self.system_prompt, model_name=alt_name)
                    alt_res = alt_model.generate_content(user_text, request_options=_REQUEST_OPTS)
                    if alt_res and alt_res.text:
                        assistant_text = alt_res.text.strip()
                        break
                except Exception as alt_err:
                    print(f"[ConversationSession] Alt model {alt_name} error: {alt_err}")

            if not assistant_text:
                if self.lang == "as":
                    assistant_text = "শুনি বহুত ভাল লাগিল। আপুনি বৰ সুন্দৰকৈ কৈছে, মোক আৰু অলপ কওকচোন।"
                elif self.lang == "hi":
                    assistant_text = "यह सुनकर बहुत अच्छा लगा। मुझे इसके बारे में और कुछ बताइए।"
                else:
                    assistant_text = "That is so wonderful to hear. Can you tell me a little more about that?"

        self.history.append({
            "role": "user",
            "text": user_text,
            "timestamp": t0,
        })
        self.history.append({
            "role": "assistant",
            "text": assistant_text,
            "timestamp": time.time(),
        })
        return assistant_text

    def get_transcript_json(self) -> str:
        return json.dumps(self.history, ensure_ascii=False)

    def elapsed_seconds(self) -> float:
        return time.time() - self.start_time


# ── Standalone utility: generate alert explanation ────────────────────
def explain_alert(metric: str, change_pct: float, duration_weeks: int) -> str:
    """
    Ask Gemini for a 2-sentence caregiver-friendly explanation.

    Falls back to a plain template if Gemini is slow or unreachable: this runs
    inside the trend-check loop on a request thread, so a hang here freezes the
    whole dashboard, and an explanation is a nicety — the alert itself is what
    matters.
    """
    fallback = (
        f"The pattern in '{metric}' has shifted by about {change_pct:.0f}% from "
        f"this person's usual range, sustained over roughly {duration_weeks} "
        f"week(s). It is worth a gentle check-in, not a cause for alarm."
    )
    try:
        model = _make_model(
            "You are a friendly health assistant. Keep explanations simple and non-alarming."
        )
        prompt = alert_explanation_prompt(metric, change_pct, duration_weeks)
        response = model.generate_content(prompt, request_options=_REQUEST_OPTS)
        text = (response.text or "").strip()
        return text or fallback
    except Exception as e:  # noqa: BLE001 — any failure degrades to the template
        print(f"[explain_alert] Gemini unavailable ({e}); using template explanation.")
        return fallback
