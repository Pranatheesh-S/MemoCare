"""
features.py – Extract behavioral metrics from an ASR result + LLM session transcript.
"""
from __future__ import annotations
import json
import re
from dataclasses import dataclass

import numpy as np
from nltk.tokenize import word_tokenize
import nltk

# Ensure required NLTK data is present
for pkg in ("punkt", "punkt_tab", "stopwords"):
    try:
        nltk.data.find(f"tokenizers/{pkg}" if "punkt" in pkg else f"corpora/{pkg}")
    except LookupError:
        nltk.download(pkg, quiet=True)

from nltk.corpus import stopwords as _sw

# ── Stopword sets ─────────────────────────────────────────────────────
_EN_STOPS = set(_sw.words("english"))
try:
    _HI_STOPS = set(_sw.words("hindi"))
except OSError:
    _HI_STOPS = set()


@dataclass
class SessionFeatureVector:
    """All behavioral metrics for one session."""
    # Timing
    mean_response_latency_s: float = 0.0
    total_speech_duration_s: float = 0.0
    mean_pause_duration_s: float = 0.0
    words_per_minute: float = 0.0

    # Lexical
    type_token_ratio: float = 0.0        # unique / total words
    mean_word_length: float = 0.0
    oov_ratio: float = 0.0               # fraction not in common vocab

    # Semantic
    topic_coherence_score: float = 0.0   # 0–1

    # Task
    task_score: float = 0.0              # 0–1
    story_coherence: float = 0.0         # 1–5 (story_completion only)


def _tokenize(text: str) -> list[str]:
    tokens = word_tokenize(text.lower())
    return [t for t in tokens if t.isalpha()]


def _common_vocab() -> set[str]:
    """Simple common English vocab proxy = NLTK stopwords + very short words."""
    return _EN_STOPS | _HI_STOPS


def compute_lexical_features(elder_turns: list[str], lang: str = "en") -> dict:
    """Compute lexical metrics from all elder utterances in a session."""
    all_text = " ".join(elder_turns)
    tokens = _tokenize(all_text)
    if not tokens:
        return {
            "type_token_ratio": 0.0,
            "mean_word_length": 0.0,
            "oov_ratio": 0.0,
        }

    unique = set(tokens)
    ttr = len(unique) / len(tokens)
    mwl = float(np.mean([len(t) for t in tokens]))
    common = _common_vocab()
    if lang in ("ta", "as"):
        # For non-Latin scripts, skip missing stopword filtering for now
        content_tokens = [t for t in tokens if len(t) > 2]
    else:
        content_tokens = [t for t in tokens if t not in common and len(t) > 2]
    
    # Very rough OOV: fraction of content tokens that are long / unusual
    oov = sum(1 for t in content_tokens if len(t) > 10) / (len(tokens) + 1e-9)

    return {
        "type_token_ratio": round(ttr, 4),
        "mean_word_length": round(mwl, 3),
        "oov_ratio": round(oov, 4),
    }


def compute_topic_coherence(
    elder_turns: list[str],
    expected_topics: list[str],
    embedder=None,
) -> float:
    """
    Compute mean cosine similarity between elder's utterances and expected topic phrases.
    Requires sentence-transformers embedder. Returns 0 if unavailable.
    """
    if embedder is None or not elder_turns or not expected_topics:
        return 0.0
    try:
        from sentence_transformers import util as st_util
        elder_embs = embedder.encode(elder_turns, convert_to_tensor=True)
        topic_embs = embedder.encode(expected_topics, convert_to_tensor=True)
        scores = st_util.cos_sim(elder_embs, topic_embs)
        return float(scores.max(dim=1).values.mean().item())
    except Exception:
        return 0.0


def extract_features(
    *,
    asr_results: list,          # list[ASRResult] — one per elder turn
    response_latencies_s: list[float],
    flow_type: str,
    lang: str = "en",
    task_score: float | None = None,
    story_coherence_score: float | None = None,
    expected_topics: list[str] | None = None,
    embedder=None,
) -> SessionFeatureVector:
    """
    Master feature extraction: combines acoustic (ASR) + lexical + task metrics.
    """
    elder_texts = [r.transcript for r in asr_results]

    # ── Timing ────────────────────────────────────────────────────────
    mean_lat = float(np.mean(response_latencies_s)) if response_latencies_s else 0.0
    total_dur = sum(r.audio_duration_s for r in asr_results)
    all_pauses = [p for r in asr_results for p in r.pause_durations_s]
    mean_pause = float(np.mean(all_pauses)) if all_pauses else 0.0
    all_wpm = [r.words_per_minute for r in asr_results if r.words_per_minute > 0]
    wpm = float(np.mean(all_wpm)) if all_wpm else 0.0

    # ── Lexical ───────────────────────────────────────────────────────
    lex = compute_lexical_features(elder_texts, lang)

    # ── Semantic ──────────────────────────────────────────────────────
    coherence = compute_topic_coherence(elder_texts, expected_topics or [], embedder)

    return SessionFeatureVector(
        mean_response_latency_s=round(mean_lat, 3),
        total_speech_duration_s=round(total_dur, 2),
        mean_pause_duration_s=round(mean_pause, 3),
        words_per_minute=round(wpm, 1),
        type_token_ratio=lex["type_token_ratio"],
        mean_word_length=lex["mean_word_length"],
        oov_ratio=lex["oov_ratio"],
        topic_coherence_score=round(coherence, 4) if coherence is not None else None,
        task_score=round(task_score, 4) if task_score is not None else None,
        story_coherence=round(story_coherence_score, 3) if story_coherence_score is not None else None,
    )
