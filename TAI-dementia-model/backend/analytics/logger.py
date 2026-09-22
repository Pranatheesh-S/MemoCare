"""
logger.py – Persist a session + its features to SQLite after each conversation.
"""
from __future__ import annotations
from datetime import datetime, timezone
from backend.database import SessionLocal, Session as DBSession, SessionFeature
from backend.analytics.features import SessionFeatureVector


def log_session(
    *,
    user_id: int,
    flow_type: str,
    started_at: datetime,
    ended_at: datetime,
    transcript_json: str,
    features: SessionFeatureVector,
    source: str = "text_fallback",
) -> int:
    """
    Save session + feature vector to DB.
    Returns the new session_id.
    """
    db = SessionLocal()
    try:
        session = DBSession(
            user_id=user_id,
            flow_type=flow_type,
            started_at=started_at,
            ended_at=ended_at,
            transcript=transcript_json,
            source=source,
        )
        db.add(session)
        db.flush()  # get session.id

        feat = SessionFeature(
            session_id=session.id,
            recorded_at=datetime.now(timezone.utc),
            mean_response_latency_s=features.mean_response_latency_s,
            total_speech_duration_s=features.total_speech_duration_s,
            mean_pause_duration_s=features.mean_pause_duration_s,
            words_per_minute=features.words_per_minute,
            type_token_ratio=features.type_token_ratio,
            mean_word_length=features.mean_word_length,
            oov_ratio=features.oov_ratio,
            topic_coherence_score=features.topic_coherence_score,
            task_score=features.task_score,
            story_coherence=features.story_coherence,
        )
        db.add(feat)
        db.commit()
        print(f"[Logger] Session {session.id} logged for user {user_id}.")
        return session.id
    finally:
        db.close()


def get_feature_history(user_id: int) -> list[dict]:
    """
    Return all session feature rows for a user, sorted by date.
    Used by the trend module.
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(SessionFeature)
            .join(DBSession, DBSession.id == SessionFeature.session_id)
            .filter(DBSession.user_id == user_id)
            .order_by(SessionFeature.recorded_at)
            .all()
        )
        return [
            {
                "session_id":             r.session_id,
                "recorded_at":            r.recorded_at,
                "mean_response_latency_s":r.mean_response_latency_s,
                "total_speech_duration_s":r.total_speech_duration_s,
                "mean_pause_duration_s":  r.mean_pause_duration_s,
                "words_per_minute":       r.words_per_minute,
                "type_token_ratio":       r.type_token_ratio,
                "mean_word_length":       r.mean_word_length,
                "oov_ratio":              r.oov_ratio,
                "topic_coherence_score":  r.topic_coherence_score,
                "task_score":             r.task_score,
                "story_coherence":        r.story_coherence,
            }
            for r in rows
        ]
    finally:
        db.close()
