"""
verify_pipeline.py – Seed the database with a user, family, routines,
and synthetic session data to trigger a trend alert.
"""
from __future__ import annotations
import sys
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.database import init_db, SessionLocal, User, SessionFeature
from backend.memory.store import create_user, add_family_member, add_routine
from backend.analytics.trend import run_trend_check
import backend.analytics.features as feat_mod


def seed_data():
    print("1. Initialising DB...")
    # Will use the configured DB_PATH in config.py
    init_db()
    
    print("2. Creating test user (NER context)...")
    db = SessionLocal()
    # Check if user already exists
    u = db.query(User).filter_by(name="Bhogeswar").first()
    if not u:
        user = create_user(name="Bhogeswar", age=78, language="as", consent=True)
        add_family_member(user.id, name="Pranjal", relation="son", notes="Lives in Guwahati.")
        add_routine(user.id, activity="Morning tea and paper", time_of_day="morning")
        u = user
    user_id = u.id
    
    print("3. Generating synthetic session data...")
    # We need BASELINE_MIN_SESSIONS (8) normal sessions, then 3 impaired sessions
    # to trigger the PELT change detector and Z-score alerts.
    
    # Check how many sessions exist, skip if we already seeded
    existing = db.query(SessionFeature).filter(SessionFeature.session.has(user_id=user_id)).count()
    if existing < 12:
        now = datetime.now(timezone.utc)
        
        # ── 8 Baseline Sessions (Normal) ──
        for i in range(8):
            f = feat_mod.SessionFeatureVector(
                mean_response_latency_s=1.5 + (0.2 * i % 3),
                total_speech_duration_s=45.0,
                mean_pause_duration_s=0.5,
                words_per_minute=90.0,
                type_token_ratio=0.75,
                mean_word_length=4.5,
                task_score=1.0,
            )
            # Create a manual DB session entry for logger simulation
            from backend.analytics.logger import log_session
            log_session(
                user_id=user_id,
                flow_type="routine_chat",
                started_at=now - timedelta(days=12-i),
                ended_at=now - timedelta(days=12-i, minutes=-2),
                transcript_json='[{"role":"user", "text":"normal"}]',
                features=f
            )
            
        print("  -> Inserted 8 baseline sessions.")
            
        # ── 4 Impaired Sessions (Pattern Shift) ──
        for i in range(4):
            f = feat_mod.SessionFeatureVector(
                mean_response_latency_s=4.5 + (0.5 * i),  # Significant increase in latency
                total_speech_duration_s=25.0,
                mean_pause_duration_s=1.8,                # Longer pauses
                words_per_minute=55.0,                    # Slower speech
                type_token_ratio=0.55,                    # Less variety
                mean_word_length=3.8,
                task_score=0.4,                           # Worse at tasks
            )
            from backend.analytics.logger import log_session
            log_session(
                user_id=user_id,
                flow_type="memory_lane",
                started_at=now - timedelta(days=3-i),
                ended_at=now - timedelta(days=3-i, minutes=-3),
                transcript_json='[{"role":"user", "text":"impaired"}]',
                features=f
            )
        print("  -> Inserted 4 abnormal sessions.")
    else:
        print(f"  -> Synthetic data already exists ({existing} sessions).")
        
    db.close()
    
    print("\n4. Running trend analysis...")
    alerts = run_trend_check(user_id)
    if alerts:
        print("\n[SUCCESS] Alerts generated:")
        for a in alerts:
            print(f"  - {a['metric']}: {a['severity'].upper()} (z={a['z_score']})")
            print(f"    Explanation: {a['explanation']}")
    else:
        print("\n[!] No alerts generated. The thresholds or synthetic data gap might need tuning.")

if __name__ == "__main__":
    seed_data()
