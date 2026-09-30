"""
POST /embed
Generate embeddings via nomic-embed-text through Ollama.
Called by the TypeScript seed script and any other TS code that needs vectors.
"""

import logging
from fastapi import APIRouter, HTTPException

from app.schemas import EmbedRequest, EmbedResponse
from app.ollama_client import embed_batch

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts must not be empty")

    try:
        embeddings = await embed_batch(req.texts)
        return EmbedResponse(embeddings=embeddings)
    except Exception as exc:
        logger.error("Embedding failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Embedding error: {exc}")
