"""
Deterministic, explainable difficulty adaptation.

The rules below run in a fixed priority order and every outcome carries a
reason code and a plain-language explanation. Nothing here is a clinical
judgement: the engine only decides how gentle or how challenging the next
activity should be.

Priority order (first match wins):
  1. repeated abandonment       -> offer a calmer activity, do not raise difficulty
  2. accuracy is too low        -> reduce difficulty by one
  3. hints are consistently high-> keep difficulty, increase hint support
  4. accuracy is consistently high -> increase difficulty by one
  5. otherwise                  -> maintain

Guarantees:
  * difficulty stays inside [min, max]
  * difficulty never moves more than one level at a time
  * a single unusual session never changes anything
"""
from __future__ import annotations

import statistics
from dataclasses import dataclass

from ..config import RULE_ENGINE_VERSION, settings
from ..safety import assert_safe_text, clamp_hint_level, clamp_step
from ..schemas import AdaptationRequest, AdaptationResponse, SessionMetric

# A calm reminiscence activity is the fallback whenever the patient seems to be
# finding things effortful.
CALM_ACTIVITY = "MEMORY_LANE"


@dataclass
class Decision:
    difficulty: int
    hint_level: int
    recommended_game_type: str
    reason_code: str
    explanation: str
    confidence: float
    evidence_session_count: int


def _comparable(sessions: list[SessionMetric], game_type: str, difficulty: int) -> list[SessionMetric]:
    """
    Sessions of the same activity at the same difficulty, newest first.

    Comparing across difficulties would make an easier level look like an
    improvement, so the engine only ever compares like with like.
    """
    same = [s for s in sessions if s.game_type == game_type and s.difficulty == difficulty]
    return sorted(same, key=lambda s: s.played_at, reverse=True)


def _completed(sessions: list[SessionMetric]) -> list[SessionMetric]:
    return [s for s in sessions if s.completed and not s.abandoned and s.accuracy is not None]


def _recent_abandoned(sessions: list[SessionMetric], game_type: str) -> int:
    """Abandonment is counted across difficulties — it is an engagement signal."""
    same = sorted(
        (s for s in sessions if s.game_type == game_type),
        key=lambda s: s.played_at,
        reverse=True,
    )[: settings.abandonment_window]
    return sum(1 for s in same if s.abandoned)


def _median_accuracy(sessions: list[SessionMetric]) -> float | None:
    values = [s.accuracy for s in sessions if s.accuracy is not None]
    return statistics.median(values) if values else None


def decide(request: AdaptationRequest) -> Decision:
    game_type = request.game_type
    current = clamp_step(request.current_difficulty, request.current_difficulty)

    # Memory Lane has no score and therefore no difficulty to adapt.
    if game_type == "MEMORY_LANE":
        return Decision(
            difficulty=current,
            hint_level=1,
            recommended_game_type=game_type,
            reason_code="UNSCORED_ACTIVITY",
            explanation="Memory Lane is a calm reminiscence activity and is not scored, so its level stays the same.",
            confidence=1.0,
            evidence_session_count=0,
        )

    comparable = _comparable(request.sessions, game_type, current)
    completed = _completed(comparable)

    # --- Rule 1: repeated abandonment ------------------------------------
    abandoned_count = _recent_abandoned(request.sessions, game_type)
    if abandoned_count >= settings.abandonment_threshold:
        return Decision(
            difficulty=current,
            hint_level=clamp_hint_level(settings.max_hint_level),
            recommended_game_type=CALM_ACTIVITY,
            reason_code="ABANDONMENT_SUPPORT",
            explanation=(
                f"{abandoned_count} of the last {min(settings.abandonment_window, len(request.sessions))} "
                "activities were left before finishing, so the level stays the same and a calmer "
                "recognition activity is offered next."
            ),
            confidence=0.75,
            evidence_session_count=abandoned_count,
        )

    # --- Rule 5 (early exit): not enough evidence -------------------------
    # One unusual session on its own never changes anything.
    if len(completed) < settings.decrease_min_sessions:
        return Decision(
            difficulty=current,
            hint_level=clamp_hint_level(_suggest_hint_level(comparable)),
            recommended_game_type=game_type,
            reason_code="INSUFFICIENT_EVIDENCE",
            explanation=(
                f"Only {len(completed)} comparable finished session(s) are available, which is not enough "
                "to change the level. The current level continues."
            ),
            confidence=0.4,
            evidence_session_count=len(completed),
        )

    # --- Rule 2: accuracy too low ----------------------------------------
    decrease_window = completed[: settings.decrease_min_sessions]
    if len(decrease_window) >= settings.decrease_min_sessions and all(
        (s.accuracy or 0.0) < settings.decrease_accuracy for s in decrease_window
    ):
        median = _median_accuracy(decrease_window) or 0.0
        target = clamp_step(current, current - 1)
        if target == current:
            # Already at the gentlest level — add hint support instead.
            return Decision(
                difficulty=current,
                hint_level=clamp_hint_level(settings.max_hint_level),
                recommended_game_type=CALM_ACTIVITY,
                reason_code="AT_MINIMUM_ADDED_SUPPORT",
                explanation=(
                    "The activity is already at its gentlest level, so more hint support is offered "
                    "and a calmer activity is suggested next."
                ),
                confidence=0.7,
                evidence_session_count=len(decrease_window),
            )
        return Decision(
            difficulty=target,
            hint_level=clamp_hint_level(_suggest_hint_level(comparable) + 1),
            recommended_game_type=game_type,
            reason_code="ACCURACY_BELOW_THRESHOLD",
            explanation=(
                f"The last {len(decrease_window)} comparable sessions were around "
                f"{median:.0%}, below the {settings.decrease_accuracy:.0%} comfort threshold, "
                f"so the level moves down to {target} with more support."
            ),
            confidence=0.8,
            evidence_session_count=len(decrease_window),
        )

    # --- Rule 3: hints consistently above threshold -----------------------
    hint_window = comparable[: settings.hint_min_sessions]
    if len(hint_window) >= settings.hint_min_sessions:
        median_hints = statistics.median([s.hints_used for s in hint_window])
        if median_hints > settings.hint_threshold:
            return Decision(
                difficulty=current,
                hint_level=clamp_hint_level(_suggest_hint_level(comparable) + 1),
                recommended_game_type=game_type,
                reason_code="HINT_SUPPORT_INCREASED",
                explanation=(
                    f"Hints were used {median_hints:.0f} times on average across the last "
                    f"{len(hint_window)} comparable sessions, so the level stays the same and more "
                    "hint support is offered."
                ),
                confidence=0.7,
                evidence_session_count=len(hint_window),
            )

    # --- Rule 4: accuracy consistently high -------------------------------
    increase_window = completed[: settings.increase_min_sessions]
    if len(increase_window) >= settings.increase_min_sessions and all(
        (s.accuracy or 0.0) >= settings.increase_accuracy for s in increase_window
    ):
        median = _median_accuracy(increase_window) or 0.0
        target = clamp_step(current, current + 1)
        if target == current:
            return Decision(
                difficulty=current,
                hint_level=clamp_hint_level(_suggest_hint_level(comparable)),
                recommended_game_type=game_type,
                reason_code="AT_MAXIMUM_MAINTAINED",
                explanation=(
                    "The activity is already at its most challenging level, and it is going well, "
                    "so the level stays the same."
                ),
                confidence=0.75,
                evidence_session_count=len(increase_window),
            )
        return Decision(
            difficulty=target,
            hint_level=clamp_hint_level(max(1, _suggest_hint_level(comparable))),
            recommended_game_type=game_type,
            reason_code="ACCURACY_ABOVE_THRESHOLD",
            explanation=(
                f"The last {len(increase_window)} comparable sessions were around {median:.0%}, "
                f"at or above the {settings.increase_accuracy:.0%} threshold, so the level moves "
                f"up gently to {target}."
            ),
            confidence=0.85,
            evidence_session_count=len(increase_window),
        )

    # --- Rule 5: maintain --------------------------------------------------
    median = _median_accuracy(completed)
    return Decision(
        difficulty=current,
        hint_level=clamp_hint_level(_suggest_hint_level(comparable)),
        recommended_game_type=game_type,
        reason_code="MAINTAIN_CURRENT_LEVEL",
        explanation=(
            "Recent sessions sit comfortably between the thresholds"
            + (f" (around {median:.0%})" if median is not None else "")
            + ", so the current level continues."
        ),
        confidence=0.65,
        evidence_session_count=len(completed),
    )


def _suggest_hint_level(sessions: list[SessionMetric]) -> int:
    """Hint level tracks how much help the patient has actually been using."""
    if not sessions:
        return 1
    median_hints = statistics.median([s.hints_used for s in sessions[:5]])
    if median_hints >= settings.hint_threshold:
        return 3
    if median_hints >= 1:
        return 2
    return 1


def recommend(request: AdaptationRequest) -> AdaptationResponse:
    decision = decide(request)
    return AdaptationResponse(
        recommended_difficulty=clamp_step(request.current_difficulty, decision.difficulty),
        hint_level=clamp_hint_level(decision.hint_level),
        recommended_game_type=decision.recommended_game_type,
        reason_code=decision.reason_code,
        explanation=assert_safe_text(decision.explanation),
        confidence=round(min(1.0, max(0.0, decision.confidence)), 2),
        evidence_session_count=decision.evidence_session_count,
        model_version=RULE_ENGINE_VERSION,
    )
