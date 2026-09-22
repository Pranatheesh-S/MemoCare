"""
main.py – FastAPI application entry point.
"""
from __future__ import annotations
import sys
from pathlib import Path

# Allow imports from project root
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from backend.config import APP_HOST, APP_PORT, validate_config, SUPPORTED_LANGUAGES
from backend.database import init_db
from backend.dashboard.routes import router as dashboard_router

# ── Startup checks ────────────────────────────────────────────────────
missing = validate_config()
if missing:
    print(f"\n[!] WARNING: Missing required config keys: {missing}")
    print("[!] Please fill in your .env file before starting sessions.\n")

# ── Init DB ───────────────────────────────────────────────────────────
init_db()

# ── App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="Dementia Companion",
    description="Warm AI companion for elderly care with passive pattern logging.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router)


# ── Health & Status ───────────────────────────────────────────────────
@app.get("/health")
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "service": "dementia-companion", "version": "0.1.0"}


# ── Audio Transcription Endpoint (Whisper ASR) ────────────────────────
from fastapi import UploadFile, File, Form
from backend.speech.asr import transcribe_file
import tempfile
import shutil

@app.post("/api/transcribe")
async def api_transcribe(
    audio: UploadFile = File(...),
    lang: str = Form("en"),
):
    """
    Accepts an audio file upload (m4a, wav, mp3, etc.),
    transcribes it with local Whisper, and returns transcript and acoustic timing.
    """
    suffix = Path(audio.filename).suffix if audio.filename else ".m4a"
    if not suffix or suffix == ".":
        suffix = ".m4a"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = Path(tmp.name)

    try:
        asr_lang = (lang or "en").lower()
        if asr_lang not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language '{lang}'. Supported languages: {', '.join(SUPPORTED_LANGUAGES)}")
        result = transcribe_file(tmp_path, language=asr_lang)
        return {
            "transcript": result.transcript,
            "language_detected": result.language_detected,
            "audio_duration_s": result.audio_duration_s,
            "word_count": result.word_count,
            "words_per_minute": result.words_per_minute,
            "pause_durations_s": result.pause_durations_s,
            "mean_pause_s": result.mean_pause_s,
        }
    except Exception as e:
        print(f"[Transcribe] Error during transcription: {e}")
        return {
            "transcript": "",
            "language_detected": lang,
            "audio_duration_s": 0.0,
            "word_count": 0,
            "words_per_minute": 0.0,
            "pause_durations_s": [],
            "mean_pause_s": 0.0,
            "error": str(e),
        }
    finally:
        tmp_path.unlink(missing_ok=True)


import base64
from pydantic import BaseModel
from typing import Optional, List

class Base64TranscribeRequest(BaseModel):
    audio_base64: str
    format: Optional[str] = "m4a"
    lang: Optional[str] = "en"

@app.post("/api/transcribe/base64")
async def api_transcribe_base64(payload: Base64TranscribeRequest):
    """
    Accepts base64 encoded audio for robust cross-platform mobile compatibility.
    """
    fmt = payload.format or "m4a"
    suffix = f".{fmt}" if not fmt.startswith(".") else fmt
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        raw_bytes = base64.b64decode(payload.audio_base64)
        tmp.write(raw_bytes)
        tmp_path = Path(tmp.name)
    try:
        asr_lang = (payload.lang or "en").lower()
        if asr_lang not in SUPPORTED_LANGUAGES:
            raise ValueError(f"Unsupported language '{payload.lang}'. Supported languages: {', '.join(SUPPORTED_LANGUAGES)}")
        result = transcribe_file(tmp_path, language=asr_lang)
        return {
            "transcript": result.transcript,
            "language_detected": result.language_detected,
            "audio_duration_s": result.audio_duration_s,
            "word_count": result.word_count,
            "words_per_minute": result.words_per_minute,
            "pause_durations_s": result.pause_durations_s,
            "mean_pause_s": result.mean_pause_s,
        }
    except Exception as e:
        print(f"[Transcribe Base64] Error: {e}")
        return {
            "transcript": "",
            "language_detected": payload.lang,
            "audio_duration_s": 0.0,
            "word_count": 0,
            "words_per_minute": 0.0,
            "pause_durations_s": [],
            "mean_pause_s": 0.0,
            "error": str(e),
        }
    finally:
        tmp_path.unlink(missing_ok=True)


# ── Companion HTTP Chat API (REST alternative to WebSockets) ──────────
from pydantic import BaseModel
from typing import Optional, List

class ChatTurn(BaseModel):
    role: str
    text: str

class CompanionChatRequest(BaseModel):
    user_id: Optional[str] = "1"
    user_name: Optional[str] = "Friend"
    flow_type: Optional[str] = "routine_chat"
    lang: Optional[str] = "en"
    text: str
    history: Optional[List[ChatTurn]] = None
    asr_metadata: Optional[dict] = None

@app.get("/api/companion/opening")
async def api_companion_opening(
    user_name: str = "Friend",
    flow_type: str = "routine_chat",
    lang: str = "en",
):
    session = ConversationSession(user_name=user_name, flow_type=flow_type, lang=lang)
    return {"opening": session.opening_line}

@app.post("/api/companion/chat")
async def api_companion_chat(payload: CompanionChatRequest):
    display_name = payload.user_name or "Friend"
    flow = payload.flow_type or "routine_chat"
    language = payload.lang or "en"
    session = ConversationSession(user_name=display_name, flow_type=flow, lang=language)
    
    # Restore prior multi-turn context if provided
    if payload.history:
        for turn in payload.history:
            session.history.append({"role": turn.role, "text": turn.text, "timestamp": time.time()})

    reply = session.send(payload.text)
    return {
        "response": reply,
        "history": session.history,
    }


# ── Session WebSocket endpoint ────────────────────────────────────────
from fastapi import WebSocket, WebSocketDisconnect
import json
import time
from datetime import datetime, timezone

from backend.conversation.engine import ConversationSession
from backend.speech.tts import speak
from backend.analytics.features import extract_features, SessionFeatureVector
from backend.analytics.logger import log_session
from backend.memory.store import get_user, create_user, list_users


@app.websocket("/ws/session/{user_id}/{flow_type}")
async def websocket_session(
    websocket: WebSocket,
    user_id: str,
    flow_type: str,
    lang: str = "en",
    user_name: str | None = None,
):
    """
    WebSocket-based session:
    Client sends JSON: {"type": "text", "content": "..."} | {"type": "end"}
    Server sends JSON: {"type": "response", "content": "..."} | {"type": "session_done"}
    """
    await websocket.accept()

    # Resolve or auto-create user
    db_user_id = 1
    user = None
    try:
        numeric_id = int(user_id)
        user = get_user(numeric_id)
        if user:
            db_user_id = user.id
    except ValueError:
        pass

    if not user:
        all_users = list_users()
        if all_users:
            user = all_users[0]
            db_user_id = user.id
        else:
            user = create_user(name=user_name or "Friend", age=70, language=lang, consent=True)
            db_user_id = user.id

    effective_lang = lang or user.language or "en"
    display_name = user.name if user else (user_name or "Friend")
    session = ConversationSession(
        user_name=display_name,
        flow_type=flow_type,
        lang=effective_lang,
    )
    started_at = datetime.now(timezone.utc)

    # Send opening line
    await websocket.send_json({"type": "response", "content": session.opening_line})

    asr_metadata_log: list[dict] = []
    prompt_sent_at: float | None = None
    latencies: list[float] = []

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "end":
                break

            user_text: str = msg.get("content", "").strip()
            if not user_text:
                continue

            if prompt_sent_at is not None:
                latencies.append(time.time() - prompt_sent_at)

            asr_meta = msg.get("asr_metadata")
            if asr_meta:
                asr_metadata_log.append(asr_meta)

            reply = session.send(user_text)
            await websocket.send_json({"type": "response", "content": reply})
            prompt_sent_at = time.time()

    except WebSocketDisconnect:
        pass
    finally:
        ended_at = datetime.now(timezone.utc)

        if asr_metadata_log:
            class _RealASR:
                def __init__(self, meta):
                    self.audio_duration_s = meta.get("audio_duration_s", 0.0)
                    self.words_per_minute = meta.get("words_per_minute", 0.0)
                    self.pause_durations_s = meta.get("pause_durations_s", [])
                    self.transcript = ""
            asr_results = [_RealASR(m) for m in asr_metadata_log]
            
            history = session.history
            elder_turns = [h for h in history if h["role"] == "user"]
            for r, t in zip(asr_results, elder_turns):
                 r.transcript = t["text"]
            
            session_source = "voice"
        else:
            history = session.history
            elder_turns = [h for h in history if h["role"] == "user"]
            class _FakeASR:
                def __init__(self, text):
                    words = text.split()
                    self.transcript = text
                    self.audio_duration_s = len(words) * 0.4
                    self.words_per_minute = (len(words) / self.audio_duration_s * 60) if self.audio_duration_s else 0
                    self.pause_durations_s = []
            asr_results = [_FakeASR(t["text"]) for t in elder_turns]
            session_source = "text_fallback"

        features = extract_features(
            asr_results=asr_results,
            response_latencies_s=latencies,
            flow_type=flow_type,
            lang=lang,
            task_score=None,
        )
        
        session_id = log_session(
            user_id=db_user_id,
            flow_type=flow_type,
            started_at=started_at,
            ended_at=ended_at,
            transcript_json=session.get_transcript_json(),
            features=features,
            source=session_source,
        )
        try:
            await websocket.send_json({"type": "session_done"})
        except Exception:
            pass


# ── Run directly ──────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=APP_HOST, port=APP_PORT, reload=True)
