"""
database.py – SQLAlchemy setup + table definitions
"""
from sqlalchemy import (
    create_engine, Column, Integer, Float, String, Text,
    DateTime, ForeignKey, Boolean
)
from sqlalchemy.orm import DeclarativeBase, relationship, sessionmaker
from datetime import datetime, timezone
from backend.config import DB_PATH

# Ensure data directory exists
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH}", echo=False)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


# ── Users ─────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(120), nullable=False)
    age         = Column(Integer)
    language    = Column(String(10), default="en")   # en / hi / as / bn
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    consent     = Column(Boolean, default=False)     # caregiver consent to log

    family      = relationship("FamilyMember", back_populates="user")
    routines    = relationship("Routine", back_populates="user")
    sessions    = relationship("Session", back_populates="user")
    alerts      = relationship("Alert", back_populates="user")


# ── Personal Memory ────────────────────────────────────────────────────
class FamilyMember(Base):
    __tablename__ = "family_members"
    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    name        = Column(String(120), nullable=False)
    relation    = Column(String(60))   # "daughter", "son", "spouse" …
    notes       = Column(Text)         # "lives in Guwahati, has two kids"
    photo_url   = Column(String(500))  # optional path/URL to photo
    user        = relationship("User", back_populates="family")


class Routine(Base):
    __tablename__ = "routines"
    id          = Column(Integer, primary_key=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False)
    activity    = Column(String(200), nullable=False)  # "morning tea at 7am"
    time_of_day = Column(String(20))   # morning / afternoon / evening / night
    user        = relationship("User", back_populates="routines")


# ── Sessions & Features ────────────────────────────────────────────────
class Session(Base):
    __tablename__ = "sessions"
    id              = Column(Integer, primary_key=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    flow_type       = Column(String(30))  # memory_lane / story_completion / who_is_this / routine_chat
    started_at      = Column(DateTime)
    ended_at        = Column(DateTime)
    transcript      = Column(Text)        # full turn-by-turn transcript JSON
    source          = Column(String(20), default="text_fallback")  # "text_fallback" | "voice"
    user            = relationship("User", back_populates="sessions")
    features        = relationship("SessionFeature", back_populates="session", uselist=False)


class SessionFeature(Base):
    """One row per session – extracted behavioral metrics."""
    __tablename__ = "session_features"
    id                      = Column(Integer, primary_key=True)
    session_id              = Column(Integer, ForeignKey("sessions.id"), unique=True)
    recorded_at             = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # ── Timing ──
    mean_response_latency_s = Column(Float)   # avg seconds before elder speaks
    total_speech_duration_s = Column(Float)
    mean_pause_duration_s   = Column(Float)
    words_per_minute        = Column(Float)

    # ── Lexical ──
    type_token_ratio        = Column(Float)   # unique_words / total_words
    mean_word_length        = Column(Float)
    oov_ratio               = Column(Float)   # out-of-vocab fraction

    # ── Semantic ──
    topic_coherence_score   = Column(Float)   # 0–1 cosine sim to expected topic

    # ── Task ──
    task_score              = Column(Float)   # 0–1 task-specific accuracy
    story_coherence         = Column(Float)   # 1–5 LLM judged (story_completion)

    # ── Composite Z-scores (filled in by trend module) ──
    z_timing                = Column(Float)
    z_lexical               = Column(Float)
    z_semantic              = Column(Float)
    z_task                  = Column(Float)

    session                 = relationship("Session", back_populates="features")


# ── Alerts ────────────────────────────────────────────────────────────
class Alert(Base):
    __tablename__ = "alerts"
    id              = Column(Integer, primary_key=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    severity        = Column(String(20))   # none / small_deviation / notable_deviation / significant_deviation
    affected_metric = Column(String(60))   # e.g. "z_timing"
    magnitude       = Column(Float)        # Z-score value
    duration_weeks  = Column(Integer)      # how many weeks this pattern persisted
    confidence      = Column(String(20))   # low / medium / high
    explanation     = Column(Text)         # 2-sentence LLM explanation
    seen_by_carer   = Column(Boolean, default=False)
    user            = relationship("User", back_populates="alerts")


def init_db():
    """Create all tables (safe to call multiple times)."""
    Base.metadata.create_all(engine)
