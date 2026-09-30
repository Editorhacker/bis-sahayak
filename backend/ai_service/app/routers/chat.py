"""
POST /chat
Full chat pipeline:
  1. Analyze message → intent, profile
  2. Route by intent
  3. Hybrid search (FTS + vector)
  4. Generate answer via Llama 3.2 3B
  5. Return structured response

TypeScript backend calls this instead of doing LLM work itself.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from app.schemas import ChatRequest, ChatResponse, Citation
from app.prompts import ANALYZER_PROMPT, ANSWER_GENERATOR_PROMPT
from app.ollama_client import generate_json, generate_text
from app.retrieval import (
    hybrid_search,
    format_context_for_llm,
    RetrievalFilters,
    RetrievalResult,
)
from app.db import get_pool

logger = logging.getLogger(__name__)
router = APIRouter()

# Intent → retrieval strategy
_BIS_INTENTS = {
    "BIS_STANDARD", "STANDARD_DISCOVERY", "TESTING",
    "CERTIFICATION", "SCHEME", "HALLMARKING", "CONSUMER",
}
_ROADMAP_INTENTS = {
    "BUSINESS_SETUP", "BUSINESS_REGISTRATION",
    "TAX_REQUIREMENT", "LICENSE_REQUIREMENT", "ROADMAP",
}


# ─────────────────────────────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    message_id = str(uuid.uuid4())

    # Step 1 – Analyze
    analysis = await _analyze(req.message)

    intent = analysis.get("intent", "GENERAL")
    profile = analysis.get("profile", {})
    language = analysis.get("language", "en")
    normalized = analysis.get("normalizedQuery", req.message)
    missing = analysis.get("missingFields", [])

    flat_profile = _normalize_profile_card(profile)

    # Filter out missing fields that already have values in profile
    actual_missing: list[str] = []
    for f in missing:
        val = flat_profile.get(f)
        if val is None or val == "":
            if f in ("businessStructure", "structure") and flat_profile.get("structure"):
                continue
            if f in ("employeeCount", "workerCount") and flat_profile.get("workerCount") is not None:
                continue
            if f in ("expectedTurnover", "annualTurnover") and flat_profile.get("annualTurnover") is not None:
                continue
            if f == "premisesType" and flat_profile.get("premisesType"):
                continue
            if f == "businessType" and flat_profile.get("businessType"):
                continue
            actual_missing.append(f)

    # Step 2 – Clarifying questions if needed
    if actual_missing and intent == "BUSINESS_SETUP":
        return ChatResponse(
            conversation_id=req.conversation_id,
            message_id=message_id,
            intent=intent,
            answer=f"I understood: {normalized}. A few details change your roadmap:",
            confidence="LOW",
            citations=[],
            disclaimer="Verify with the official authority; not legal advice.",
            suggested_actions=["Provide missing details"],
            clarifying_questions=_clarifying_questions(actual_missing),
            profile_card=flat_profile,
        )

    # Step 3 – Route
    if intent in _BIS_INTENTS:
        return await _bis_handler(req, message_id, intent, analysis, language)
    elif intent == "LABORATORY":
        return await _labs_handler(req, message_id, intent, analysis, language)
    else:
        return await _general_handler(req, message_id, intent, language)


# ─────────────────────────────────────────────────────────────────────────────
# Handlers
# ─────────────────────────────────────────────────────────────────────────────

async def _bis_handler(
    req: ChatRequest,
    message_id: str,
    intent: str,
    analysis: dict,
    language: str,
) -> ChatResponse:
    profile = analysis.get("profile", {})
    product = profile.get("product", {})
    location = profile.get("location", {})

    search_terms = [
        product.get("name"),
        product.get("material"),
        product.get("category"),
        product.get("usage"),
        location.get("state"),
    ]
    query = " ".join(t for t in search_terms if t)
    if not query:
        query = req.message

    results = await hybrid_search(
        query,
        RetrievalFilters(doc_types=["standard", "scheme", "guideline"]),
    )

    if not results:
        return ChatResponse(
            conversation_id=req.conversation_id,
            message_id=message_id,
            intent=intent,
            answer=(
                "I could not find relevant BIS standards for your query. "
                "Please verify with BIS directly at https://bis.gov.in."
            ),
            confidence="INSUFFICIENT_EVIDENCE",
            citations=[],
            disclaimer="Verify with the official authority; not legal advice.",
            suggested_actions=["Search BIS catalogue", "Contact BIS directly"],
        )

    context = format_context_for_llm(results)
    prompt = (
        f"{ANSWER_GENERATOR_PROMPT}\n\n"
        f"CONTEXT:\n{context}\n\n"
        f"QUESTION: {req.message}\n\n"
        f"LANGUAGE: {language}"
    )

    try:
        llm_data = await generate_json(prompt)
    except Exception as exc:
        logger.error("BIS answer generation failed: %s", exc)
        llm_data = {
            "answer": "I encountered an error. Please try again.",
            "confidence": "INSUFFICIENT_EVIDENCE",
            "citations": [],
            "disclaimer": "Verify with the official authority; not legal advice.",
            "suggestedActions": [],
        }

    confidence = llm_data.get("confidence", "LOW")
    citations = [
        Citation(
            chunkId=r.chunk_id,
            standardNumber=r.standard_number,
            clause=r.clause,
            excerpt=r.content[:200],
            sourceUrl=r.source_url,
        )
        for r in results
    ]

    return ChatResponse(
        conversation_id=req.conversation_id,
        message_id=message_id,
        intent=intent,
        answer=llm_data.get("answer", ""),
        confidence=confidence,
        citations=citations,
        disclaimer=llm_data.get("disclaimer", "Verify with the official authority; not legal advice."),
        suggested_actions=llm_data.get("suggestedActions", []),
    )


async def _labs_handler(
    req: ChatRequest,
    message_id: str,
    intent: str,
    analysis: dict,
    language: str,
) -> ChatResponse:
    profile = analysis.get("profile", {})
    state = profile.get("location", {}).get("state") or "Maharashtra"

    pool = get_pool()
    rows = await pool.fetch(
        "SELECT name, city, state, capabilities FROM labs WHERE state = $1 LIMIT 10",
        state,
    )

    lab_list = "\n".join(
        f"• {r['name']} ({r['city']}, {r['state']}) – "
        + (", ".join(r["capabilities"]) if r["capabilities"] else "Various tests")
        for r in rows
    )

    return ChatResponse(
        conversation_id=req.conversation_id,
        message_id=message_id,
        intent=intent,
        answer=f"Recognized testing labs in {state}:\n{lab_list or 'No labs found in database.'}",
        confidence="MEDIUM",
        citations=[],
        disclaimer="Verify with the official authority; not legal advice.",
        suggested_actions=["Contact lab directly", "Check lab accreditation"],
    )


async def _general_handler(
    req: ChatRequest,
    message_id: str,
    intent: str,
    language: str,
) -> ChatResponse:
    return ChatResponse(
        conversation_id=req.conversation_id,
        message_id=message_id,
        intent=intent,
        answer=(
            "I'm here to help with business compliance questions. "
            "Ask me about BIS standards, certifications, registrations, taxes, or licenses."
        ),
        confidence="LOW",
        citations=[],
        disclaimer="Verify with the official authority; not legal advice.",
        suggested_actions=["Ask about BIS standards", "Generate roadmap", "Search requirements"],
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

async def _analyze(message: str) -> dict:
    prompt = f"{ANALYZER_PROMPT}\n\nUser message: \"{message}\""
    try:
        return await generate_json(prompt)
    except Exception as exc:
        logger.warning("Analyzer failed, using default: %s", exc)
        return {
            "language": "en",
            "normalizedQuery": message,
            "intent": "GENERAL",
            "profile": {
                "product": {"name": None, "material": None, "usage": None, "category": None},
                "location": {"state": None, "city": None},
                "businessType": None,
                "businessStructure": None,
                "premisesType": None,
                "employeeCount": None,
                "expectedTurnover": None,
            },
            "missingFields": [],
        }


def _normalize_profile_card(profile: dict) -> dict:
    product = profile.get("product") if isinstance(profile.get("product"), dict) else {}
    location = profile.get("location") if isinstance(profile.get("location"), dict) else {}

    city = location.get("city") or profile.get("city")
    state = location.get("state") or profile.get("state")
    loc_parts = [c for c in [city, state] if c]
    location_str = ", ".join(loc_parts) if loc_parts else (profile.get("location") if isinstance(profile.get("location"), str) else None)

    product_name = product.get("name") or profile.get("productName") or profile.get("businessName")
    material = product.get("material") or profile.get("material")
    structure = profile.get("structure") or profile.get("businessStructure")
    worker_count = profile.get("workerCount") or profile.get("employeeCount")
    turnover = profile.get("annualTurnover") or profile.get("expectedTurnover")

    return {
        **profile,
        "productName": product_name,
        "material": material,
        "location": location_str,
        "state": state,
        "city": city,
        "structure": structure,
        "businessStructure": structure,
        "workerCount": worker_count,
        "employeeCount": worker_count,
        "annualTurnover": turnover,
        "expectedTurnover": turnover,
    }


_FIELD_QUESTIONS: dict[str, dict] = {
    "businessType": {
        "text": "Will you manufacture, trade/resell, or sell online?",
        "options": ["manufacturing", "trading", "online_seller", "service"],
    },
    "businessStructure": {
        "text": "Business structure?",
        "options": ["proprietorship", "partnership", "llp", "private_limited", "not_decided"],
    },
    "structure": {
        "text": "Business structure?",
        "options": ["proprietorship", "partnership", "llp", "private_limited", "not_decided"],
    },
    "premisesType": {
        "text": "Where will you operate from?",
        "options": ["home", "shop", "factory_unit", "warehouse"],
    },
    "employeeCount": {"text": "About how many workers?", "type": "number"},
    "workerCount": {"text": "About how many workers?", "type": "number"},
    "expectedTurnover": {"text": "Expected annual turnover (INR)?", "type": "number"},
    "annualTurnover": {"text": "Expected annual turnover (INR)?", "type": "number"},
    "state": {"text": "Which state?", "type": "text"},
    "city": {"text": "Which city?", "type": "text"},
    "material": {"text": "What material is used?", "type": "text"},
}


def _clarifying_questions(missing: list[str]) -> list[dict]:
    out = []
    for field in missing:
        q = _FIELD_QUESTIONS.get(field)
        if q:
            out.append({
                "field": field,
                "question": q["text"],
                "text": q["text"],
                **q
            })
    return out

