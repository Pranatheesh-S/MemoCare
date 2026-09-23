"""
SmritiSetu AI — custom accessibility voice service.

The application's narration is spoken in one person's own recorded voice rather
than a synthetic system voice. Fixed narration (buttons, screens, instructions,
game prompts, help) is generated ahead of time and replayed instantly; only
genuinely changing text — a companion reply, a personalised reminder — is
generated at runtime.

Nothing here is on the critical path of the patient app: if this service is
absent, disabled or broken, the app narrates with the device's own speech engine
exactly as it did before.
"""
from __future__ import annotations

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.tts_routes import router as tts_router
from .config import SERVICE_VERSION, Settings, settings
from .models.qwen_tts import TTSProvider
from .services.dynamic_voice_service import DynamicVoiceService
from .services.static_voice_service import StaticVoiceService
from .services.tts_service import TTSService
from .utils.file_manager import ensure_directories

logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO))
logger = logging.getLogger("smritisetu.tts")

SWEEP_INTERVAL_SECONDS = 3600


async def _retention_loop(dynamic: DynamicVoiceService) -> None:
    """Removes expired generated clips. Static voice-overs are never touched."""
    while True:
        try:
            dynamic.sweep()
        except Exception as error:  # noqa: BLE001 — a sweep failure must not end the loop
            logger.warning("Retention sweep failed: %s", error)
        await asyncio.sleep(SWEEP_INTERVAL_SECONDS)


def create_app(config: Settings | None = None, provider: TTSProvider | None = None) -> FastAPI:
    """
    Builds the service.

    `provider` exists so the suite can exercise every path — caching, retention,
    chunking, failure — against a stand-in engine, with no model downloaded.
    """
    active = config or settings

    @asynccontextmanager
    async def lifespan(instance: FastAPI) -> AsyncIterator[None]:
        ensure_directories(active.output_dir, active.static_output_dir, active.voices_dir)

        tts = TTSService(active, provider)
        instance.state.settings = active
        instance.state.tts = tts
        instance.state.static = StaticVoiceService(active)
        instance.state.dynamic = DynamicVoiceService(active, tts)

        # Loaded once, here — never per sentence.
        await tts.start()
        if active.enabled and not tts.ready:
            logger.warning(
                "The cloned voice is not available; the app will fall back to the device's own "
                "speech engine. Reason: %s",
                getattr(tts.provider, "load_error", None) or "unknown",
            )

        instance.state.dynamic.sweep()
        sweeper = asyncio.create_task(_retention_loop(instance.state.dynamic))
        try:
            yield
        finally:
            sweeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await sweeper

    instance = FastAPI(
        title="SmritiSetu AI — Custom Voice Service",
        version=SERVICE_VERSION,
        description=(
            "Accessibility narration in a caregiver's own voice, cloned once from a "
            "single short recording with Qwen3-TTS.\n\n"
            "**Boundary.** The reference recording is server-side configuration. A "
            "client sends text and receives audio; it can never name, read or "
            "receive the voice it is spoken in."
        ),
        lifespan=lifespan,
    )

    instance.add_middleware(
        CORSMiddleware,
        allow_origins=list(active.cors_origins),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )
    instance.include_router(tts_router)

    @instance.get("/health", tags=["Health"])
    def health() -> dict[str, object]:
        """Container-level liveness. The detailed report is `GET /tts/health`."""
        return {"status": "ok", "service": "smritisetu-tts-service", "version": SERVICE_VERSION}

    return instance


app = create_app()
