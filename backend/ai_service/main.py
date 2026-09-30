"""
BIS SAHAYAK – Python AI Microservice
==========================================
FastAPI service that owns ALL AI/RAG logic:
  - Message analysis (intent, language, profile extraction)
  - Hybrid search  (FTS + pgvector, fused via RRF)
  - Answer generation  (Llama 3.2 3B via Ollama)
  - Embeddings        (nomic-embed-text via Ollama)
  - Compliance-answer validation
  - Roadmap reasoning

TypeScript backend calls this service over HTTP.
"""

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.db import init_db_pool, close_db_pool
from app.ollama_client import wait_for_ollama
from app.routers import chat, embed, analyze, health

# ─────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger("ai_service")


# ─────────────────────────────────────────────────
# Lifespan  (startup / shutdown hooks)
# ─────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service starting up …")
    await init_db_pool()
    await wait_for_ollama()
    logger.info("AI Service ready ✓")
    yield
    logger.info("AI Service shutting down …")
    await close_db_pool()


# ─────────────────────────────────────────────────
# App
# ─────────────────────────────────────────────────
app = FastAPI(
    title="BIS SAHAYAK AI Service",
    description="RAG + LLM microservice powering BIS compliance assistant",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    # Only accept requests from the TypeScript backend (internal network)
    allow_origins=[settings.BACKEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Internal-Token"],
)

# ─────────────────────────────────────────────────
# Internal auth guard  (shared secret between TS ↔ Python)
# ─────────────────────────────────────────────────
@app.middleware("http")
async def internal_auth(request: Request, call_next):
    if request.url.path in ("/health", "/docs", "/openapi.json"):
        return await call_next(request)
    token = request.headers.get("X-Internal-Token", "")
    if token != settings.INTERNAL_SECRET:
        return JSONResponse(status_code=403, content={"detail": "Forbidden"})
    return await call_next(request)


# ─────────────────────────────────────────────────
# Routers
# ─────────────────────────────────────────────────
app.include_router(health.router, tags=["Health"])
app.include_router(analyze.router, prefix="/analyze", tags=["Analyze"])
app.include_router(embed.router,   prefix="/embed",   tags=["Embed"])
app.include_router(chat.router,    prefix="/chat",    tags=["Chat"])
