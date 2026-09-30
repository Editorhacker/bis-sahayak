"""
Pydantic request/response schemas shared across routers.
"""

from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


# ── Analyze ───────────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)


class ProductProfile(BaseModel):
    name: str | None = None
    material: str | None = None
    usage: str | None = None
    category: str | None = None
    isInsulated: bool | str | None = None


class LocationProfile(BaseModel):
    state: str | None = None
    city: str | None = None


class Profile(BaseModel):
    product: ProductProfile = ProductProfile()
    location: LocationProfile = LocationProfile()
    businessType: str | None = None
    businessStructure: str | None = None
    premisesType: str | None = None
    employeeCount: int | None = None
    expectedTurnover: float | None = None
    isInsulated: bool | str | None = None


class AnalyzeResponse(BaseModel):
    language: str
    normalizedQuery: str
    intent: str
    profile: Profile
    missingFields: list[str] = []


# ── Embed ─────────────────────────────────────────────────────────────────────

class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1)


class EmbedResponse(BaseModel):
    embeddings: list[list[float]]


# ── Chat ──────────────────────────────────────────────────────────────────────

class HistoryItem(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    conversation_id: str
    user_id: str
    business_id: str | None = None
    language: str = "en"
    history: list[HistoryItem] = []


class Citation(BaseModel):
    chunkId: int
    standardNumber: str | None
    clause: str | None
    excerpt: str
    sourceUrl: str | None


class ChatResponse(BaseModel):
    conversation_id: str
    message_id: str
    intent: str
    answer: str
    confidence: str
    citations: list[Citation]
    disclaimer: str
    suggested_actions: list[str]
    clarifying_questions: list[dict[str, Any]] | None = None
    profile_card: dict[str, Any] | None = None
    roadmap_id: str | None = None
