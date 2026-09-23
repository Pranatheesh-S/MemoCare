"""Request and response contracts for the custom-voice service."""
from __future__ import annotations

from pydantic import BaseModel, Field


class GenerateRequest(BaseModel):
    """
    A client sends words and nothing else.

    It cannot name a reference recording, a voice or a file path: the voice is
    the service's own configuration and never travels over the wire.
    """

    text: str = Field(..., min_length=1, description="The words to speak.")
    language: str = Field("en", min_length=2, max_length=8, description="ISO language code.")


class GenerateResponse(BaseModel):
    success: bool
    id: str
    audioUrl: str
    duration: float
    cached: bool = False


class HealthResponse(BaseModel):
    enabled: bool
    modelLoaded: bool
    referenceVoiceLoaded: bool
    device: str
    provider: str
    languages: list[str]
    speechRate: float
    fallbackSystemVoice: bool
    staticClips: int
    cachedClips: int
    version: str


class ManifestResponse(BaseModel):
    language: str
    baseUrl: str
    entries: dict[str, str]
