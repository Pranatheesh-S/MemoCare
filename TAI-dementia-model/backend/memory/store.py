"""
store.py – Personal memory & routine CRUD using SQLAlchemy.
"""
from __future__ import annotations
from sqlalchemy.orm import Session as DBSession
from backend.database import SessionLocal, User, FamilyMember, Routine, init_db
from backend.config import SUPPORTED_LANGUAGES, PRIMARY_LANG


def get_db() -> DBSession:
    return SessionLocal()


# ── Users ─────────────────────────────────────────────────────────────

def create_user(name: str, age: int, language: str = PRIMARY_LANG, consent: bool = False) -> User:
    if language not in SUPPORTED_LANGUAGES:
        language = PRIMARY_LANG
    db = get_db()
    try:
        user = User(name=name, age=age, language=language, consent=consent)
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def get_user(user_id: int) -> User | None:
    db = get_db()
    try:
        user = db.get(User, user_id)
        return user
    finally:
        db.close()


def list_users() -> list[User]:
    db = get_db()
    try:
        users = db.query(User).all()
        return users
    finally:
        db.close()


# ── Family Members ────────────────────────────────────────────────────

def add_family_member(
    user_id: int, name: str, relation: str,
    notes: str = "", photo_url: str = ""
) -> FamilyMember:
    db = get_db()
    try:
        member = FamilyMember(
            user_id=user_id, name=name, relation=relation,
            notes=notes, photo_url=photo_url
        )
        db.add(member)
        db.commit()
        db.refresh(member)
        return member
    finally:
        db.close()


def get_family_members(user_id: int) -> list[FamilyMember]:
    db = get_db()
    try:
        members = db.query(FamilyMember).filter(FamilyMember.user_id == user_id).all()
        return members
    finally:
        db.close()


# ── Routines ──────────────────────────────────────────────────────────

def add_routine(user_id: int, activity: str, time_of_day: str = "morning") -> Routine:
    db = get_db()
    try:
        routine = Routine(user_id=user_id, activity=activity, time_of_day=time_of_day)
        db.add(routine)
        db.commit()
        db.refresh(routine)
        return routine
    finally:
        db.close()


def get_routines(user_id: int, time_of_day: str | None = None) -> list[Routine]:
    db = get_db()
    try:
        q = db.query(Routine).filter(Routine.user_id == user_id)
        if time_of_day:
            q = q.filter(Routine.time_of_day == time_of_day)
        routines = q.all()
        return routines
    finally:
        db.close()


def get_context_summary(user_id: int) -> str:
    """
    Build a compact context string injected into the LLM system prompt
    so the companion can personalise: "Your daughter Priya lives in Guwahati…"
    """
    user = get_user(user_id)
    if not user:
        return ""

    lines = [f"The elder's name is {user.name}, aged {user.age}."]
    members = get_family_members(user_id)
    if members:
        lines.append("Family members:")
        for m in members:
            note = f" ({m.notes})" if m.notes else ""
            lines.append(f"  - {m.relation}: {m.name}{note}")
    routines = get_routines(user_id)
    if routines:
        lines.append("Usual routines:")
        for r in routines:
            lines.append(f"  - {r.time_of_day}: {r.activity}")
    return "\n".join(lines)
