"""
routes.py – FastAPI routes for the caregiver dashboard and session API.
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Form, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from pathlib import Path

from backend.memory.store import list_users, get_user, create_user, add_family_member, add_routine
from backend.analytics.trend import get_user_alerts, get_trend_sparklines, run_trend_check

templates = Jinja2Templates(directory=str(Path(__file__).parent / "templates"))
router = APIRouter()


# ── Dashboard ─────────────────────────────────────────────────────────

@router.get("/", response_class=HTMLResponse)
async def index(request: Request):
    users = list_users()
    return templates.TemplateResponse(request, "dashboard.html", {
        "users": users,
        "selected_user": None,
        "alerts": [],
        "sparklines": {},
    })


@router.get("/dashboard/{user_id}", response_class=HTMLResponse)
async def dashboard(request: Request, user_id: int):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    alerts   = get_user_alerts(user_id)
    sparklines = get_trend_sparklines(user_id)
    users    = list_users()
    return templates.TemplateResponse(request, "dashboard.html", {
        "users": users,
        "selected_user": user,
        "alerts": alerts,
        "sparklines": sparklines,
    })


@router.get("/elder/{user_id}", response_class=HTMLResponse)
async def elder_ui(request: Request, user_id: int, flow: str = "routine_chat", lang: str = "en"):
    user = get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return templates.TemplateResponse(request, "elder.html", {
        "user_id": user_id,
        "flow_type": flow,
        "lang": lang,
    })

@router.get("/api/alerts/{user_id}")
async def api_alerts(user_id: int):
    return JSONResponse(get_user_alerts(user_id))


@router.get("/api/sparklines/{user_id}")
async def api_sparklines(user_id: int):
    return JSONResponse(get_trend_sparklines(user_id))


@router.post("/api/run_trend/{user_id}")
async def api_run_trend(user_id: int):
    new_alerts = run_trend_check(user_id)
    return JSONResponse({"alerts_created": len(new_alerts), "details": new_alerts})


# ── User Management ───────────────────────────────────────────────────

@router.post("/api/users")
async def api_create_user(
    name: str = Form(...),
    age: int = Form(...),
    language: str = Form("en"),
):
    user = create_user(name=name, age=age, language=language, consent=True)
    return JSONResponse({"id": user.id, "name": user.name})


@router.post("/api/family/{user_id}")
async def api_add_family(
    user_id: int,
    name: str = Form(...),
    relation: str = Form(...),
    notes: str = Form(""),
):
    m = add_family_member(user_id, name=name, relation=relation, notes=notes)
    return JSONResponse({"id": m.id})


@router.post("/api/routine/{user_id}")
async def api_add_routine(
    user_id: int,
    activity: str = Form(...),
    time_of_day: str = Form("morning"),
):
    r = add_routine(user_id, activity=activity, time_of_day=time_of_day)
    return JSONResponse({"id": r.id})
