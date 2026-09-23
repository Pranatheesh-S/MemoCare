"""
AI-based personalisation: turns a patient's own session history into a single
comfortable plan for the next activity.

`signals.derive_signals` builds the observations. `planner.plan_session`
composes a deterministic baseline plan from the existing rule engines, then
lets the optional Gemini layer soften it within fixed bounds. Every plan is
clamped and safety-checked before it leaves this package.
"""
from .planner import plan_session
from .signals import derive_signals

__all__ = ["plan_session", "derive_signals"]
