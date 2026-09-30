"""
POST /analyze
Analyze a user message: detect language, intent, and extract business profile.
Called by the TypeScript chat controller before routing.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.schemas import AnalyzeRequest, AnalyzeResponse, Profile, ProductProfile, LocationProfile
from app.prompts import ANALYZER_PROMPT
from app.ollama_client import generate_json

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    prompt = f"{ANALYZER_PROMPT}\n\nUser message: \"{req.message}\""

    try:
        data = await generate_json(prompt)
    except Exception as exc:
        logger.error("Analyzer LLM call failed: %s", exc)
        # Return a safe fallback — TypeScript will handle GENERAL intent
        return AnalyzeResponse(
            language="en",
            normalizedQuery=req.message,
            intent="GENERAL",
            profile=Profile(),
            missingFields=[],
        )

    try:
        profile_raw = data.get("profile", {})
        product_raw = profile_raw.get("product", {})
        location_raw = profile_raw.get("location", {})

        return AnalyzeResponse(
            language=data.get("language", "en"),
            normalizedQuery=data.get("normalizedQuery", req.message),
            intent=data.get("intent", "GENERAL"),
            profile=Profile(
                product=ProductProfile(
                    name=product_raw.get("name"),
                    material=product_raw.get("material"),
                    usage=product_raw.get("usage"),
                    category=product_raw.get("category"),
                ),
                location=LocationProfile(
                    state=location_raw.get("state"),
                    city=location_raw.get("city"),
                ),
                businessType=profile_raw.get("businessType"),
                businessStructure=profile_raw.get("businessStructure"),
                premisesType=profile_raw.get("premisesType"),
                employeeCount=profile_raw.get("employeeCount"),
                expectedTurnover=profile_raw.get("expectedTurnover"),
            ),
            missingFields=data.get("missingFields", []),
        )
    except Exception as exc:
        logger.error("Analyzer response parse failed: %s | raw: %s", exc, data)
        raise HTTPException(status_code=500, detail="Failed to parse LLM analysis response")
