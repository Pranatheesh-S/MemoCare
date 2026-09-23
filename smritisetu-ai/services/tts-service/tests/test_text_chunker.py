"""Long narration must break where a person would pause, and nowhere else."""
from __future__ import annotations

from app.utils.text_chunker import chunk_text, split_sentences


def test_splits_a_companion_reply_into_natural_sentences() -> None:
    text = "Good morning. Your memory activity is ready. Would you like to begin?"
    assert split_sentences(text) == [
        "Good morning.",
        "Your memory activity is ready.",
        "Would you like to begin?",
    ]


def test_splits_on_question_exclamation_and_semicolon() -> None:
    assert split_sentences("You did it! Shall we go on; or rest?") == [
        "You did it!",
        "Shall we go on;",
        "or rest?",
    ]


def test_keeps_a_title_with_its_name() -> None:
    assert split_sentences("Dr. Sharma will visit today.") == ["Dr. Sharma will visit today."]


def test_keeps_initials_together() -> None:
    assert split_sentences("This is R. K. Das, your neighbour.") == [
        "This is R. K. Das, your neighbour."
    ]


def test_does_not_split_inside_a_time_or_a_number() -> None:
    assert split_sentences("Your medicine is at 3.30 in the afternoon.") == [
        "Your medicine is at 3.30 in the afternoon."
    ]


def test_groups_short_sentences_up_to_the_chunk_limit() -> None:
    chunks = chunk_text("One. Two. Three. Four.", max_chars=12)
    assert chunks == ["One. Two.", "Three. Four."]
    assert all(len(chunk) <= 12 for chunk in chunks)


def test_breaks_a_very_long_sentence_at_a_comma_never_mid_word() -> None:
    sentence = (
        "When you are ready, we can look at the photographs together, "
        "slowly, and you can tell me about them."
    )
    chunks = chunk_text(sentence, max_chars=40)
    assert all(len(chunk) <= 40 for chunk in chunks)
    # Every word survives the split, in order, with none cut in half.
    assert " ".join(chunks).split() == sentence.split()


def test_empty_text_produces_no_chunks() -> None:
    assert chunk_text("   ") == []
