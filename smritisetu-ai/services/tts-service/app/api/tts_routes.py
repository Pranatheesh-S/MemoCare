"""
HTTP surface.

Deliberately small: generate speech, fetch speech, list what is pre-generated,
and report health. There is no endpoint that reads a caller-supplied path, and
no endpoint that returns the reference recording.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse

from ..config import SERVICE_VERSION, settings
from ..models.qwen_tts import TTSUnavailableError
from ..schemas import GenerateRequest, GenerateResponse, HealthResponse, ManifestResponse
from ..services.dynamic_voice_service import DynamicVoiceService
from ..services.static_voice_service import StaticVoiceService
from ..services.tts_service import TextTooLongError, TTSService

logger = logging.getLogger("smritisetu.tts")

router = APIRouter(prefix="/tts", tags=["Voice"])


async def require_api_key(
    request: Request,
    authorization: str = Header(default=""),
    x_api_key: str = Header(default=""),
) -> None:
    """
    Enforced only when TTS_API_KEY is set.

    Left unset for local development, where the service is reachable only on the
    developer's own network; set it for anything exposed beyond that.
    """
    configured = getattr(request.app.state, "settings", settings).api_key
    if not configured:
        return
    presented = x_api_key or authorization.removeprefix("Bearer ").strip()
    if presented != configured:
        raise HTTPException(status_code=401, detail={"code": "UNAUTHORISED", "message": "Invalid API key."})


def _tts(request: Request) -> TTSService:
    return request.app.state.tts


def _dynamic(request: Request) -> DynamicVoiceService:
    return request.app.state.dynamic


def _static(request: Request) -> StaticVoiceService:
    return request.app.state.static


@router.get("/health", response_model=HealthResponse)
def health(request: Request) -> HealthResponse:
    """
    Reports whether the voice is usable. Never reveals where the voice lives:
    a path on the server is not a client's business.
    """
    tts = _tts(request)
    report = tts.health()
    return HealthResponse(
        **report,  # type: ignore[arg-type]
        staticClips=_static(request).count(),
        cachedClips=_dynamic(request).cache_size,
        version=SERVICE_VERSION,
    )


@router.post("/generate", response_model=GenerateResponse, dependencies=[Depends(require_api_key)])
async def generate(payload: GenerateRequest, request: Request) -> GenerateResponse:
    """Speaks text that changes — a chatbot reply, a personalised reminder."""
    tts = _tts(request)
    try:
        text = tts.validate(payload.text, payload.language)
    except TextTooLongError as error:
        raise HTTPException(status_code=413, detail={"code": "TEXT_TOO_LONG", "message": str(error)}) from error
    except TTSUnavailableError as error:
        raise HTTPException(
            status_code=503, detail={"code": "LANGUAGE_UNAVAILABLE", "message": str(error)}
        ) from error
    except ValueError as error:
        raise HTTPException(status_code=422, detail={"code": "INVALID_TEXT", "message": str(error)}) from error

    if not tts.ready:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "VOICE_UNAVAILABLE",
                "message": "The cloned voice is not available. The client should fall back.",
            },
        )

    try:
        clip = await _dynamic(request).generate(text, payload.language)
    except TTSUnavailableError as error:
        logger.warning("Generation failed, client will fall back: %s", error)
        raise HTTPException(
            status_code=503, detail={"code": "VOICE_UNAVAILABLE", "message": str(error)}
        ) from error

    return GenerateResponse(
        success=True,
        id=clip.audio_id,
        audioUrl=f"/tts/audio/{clip.audio_id}.wav",
        duration=clip.duration,
        cached=clip.cached,
    )


@router.get("/audio/{audio_id}")
def audio(audio_id: str, request: Request) -> Response:
    """Serves a generated clip. The id must be a UUID; nothing else resolves."""
    path = _dynamic(request).resolve(audio_id.removesuffix(".wav"))
    if path is None:
        raise HTTPException(status_code=404, detail={"code": "AUDIO_NOT_FOUND", "message": "No such clip."})
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})


@router.get("/static/{language}/{filename}")
def static_audio(language: str, filename: str, request: Request) -> Response:
    """
    Serves a pre-generated clip.

    The app normally bundles these, so this exists for clients that cache them
    on first run instead — a web build, or a device provisioned over the network.
    """
    path = _static(request).resolve(language, filename)
    if path is None:
        raise HTTPException(status_code=404, detail={"code": "AUDIO_NOT_FOUND", "message": "No such clip."})
    return FileResponse(path, media_type="audio/wav", headers={"Cache-Control": "public, max-age=604800"})


@router.get("/manifest", response_model=ManifestResponse)
def manifest(request: Request, language: str = "en") -> ManifestResponse:
    """Which keys have pre-generated audio, and the file for each."""
    return ManifestResponse(
        language=language,
        baseUrl="/tts/static",
        entries=_static(request).flat_map(language),
    )
