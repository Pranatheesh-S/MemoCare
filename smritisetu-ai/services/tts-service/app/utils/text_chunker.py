"""
Sentence chunking for long narration.

A chatbot reply or a guided instruction is spoken in natural segments so the
first words start sooner. Splitting must never fall inside a word, a name, a
number or an abbreviation — "Dr. Sharma" and "10.30" are one piece each.
"""
from __future__ import annotations

import re

# Abbreviations whose full stop does not end a sentence.
_ABBREVIATIONS = {
    "dr", "mr", "mrs", "ms", "prof", "sr", "jr", "st", "no", "vs", "etc",
    "e.g", "i.e", "approx", "dept", "govt", "min", "max", "hrs", "am", "pm",
}

_BOUNDARY = re.compile(r"([.!?;])(\s+)")


def _ends_sentence(head: str) -> bool:
    """False when the full stop belongs to an abbreviation, initial or number."""
    stripped = head.rstrip()
    if not stripped:
        return False
    terminator = stripped[-1]
    if terminator in "!?;":
        return True

    body = stripped[:-1]
    last_word = re.split(r"[\s(\[\"']", body)[-1] if body else ""
    if not last_word:
        return False
    # "10." or "3.30" — a number, not the end of a thought.
    if last_word[-1].isdigit():
        return True if last_word.isdigit() and len(last_word) > 2 else False
    if last_word.lower().strip(".") in _ABBREVIATIONS:
        return False
    # A single capital letter is an initial: "R. K. Das".
    if len(last_word) == 1 and last_word.isupper():
        return False
    return True


def split_sentences(text: str) -> list[str]:
    """Splits on . ? ! ; keeping the terminator with its sentence."""
    normalised = re.sub(r"\s+", " ", text or "").strip()
    if not normalised:
        return []

    sentences: list[str] = []
    buffer = ""
    for part in _BOUNDARY.split(normalised):
        buffer += part
        if part and part[-1] in ".!?;" and _ends_sentence(buffer):
            candidate = buffer.strip()
            if candidate:
                sentences.append(candidate)
            buffer = ""
    tail = buffer.strip()
    if tail:
        sentences.append(tail)
    return sentences


def _split_long(sentence: str, max_chars: int) -> list[str]:
    """Breaks an over-long sentence at commas, then at spaces — never mid-word."""
    if len(sentence) <= max_chars:
        return [sentence]

    pieces: list[str] = []
    buffer = ""
    for token in re.split(r"(,\s+|\s+)", sentence):
        if len(buffer) + len(token) > max_chars and buffer.strip():
            pieces.append(buffer.strip())
            buffer = ""
        buffer += token
    if buffer.strip():
        pieces.append(buffer.strip())
    return pieces


def chunk_text(text: str, max_chars: int = 240) -> list[str]:
    """
    Groups sentences into chunks of at most `max_chars`.

    Whole sentences are kept together wherever they fit, so the voice never
    pauses in a place a person would not.
    """
    sentences = split_sentences(text)
    if not sentences:
        return []

    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        for piece in _split_long(sentence, max_chars):
            if not current:
                current = piece
            elif len(current) + 1 + len(piece) <= max_chars:
                current = f"{current} {piece}"
            else:
                chunks.append(current)
                current = piece
    if current:
        chunks.append(current)
    return chunks
