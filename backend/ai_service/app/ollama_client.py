"""
Async Ollama client.
Handles:
  - Text generation  (Llama 3.2 3B)
  - Embeddings       (nomic-embed-text)
  - Model pull on startup
  - Retry / back-off
"""

import asyncio
import json
import logging
import re
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# Shared async HTTP client (reused across requests)
_http: httpx.AsyncClient | None = None


def _get_http() -> httpx.AsyncClient:
    global _http
    if _http is None:
        _http = httpx.AsyncClient(
            base_url=settings.OLLAMA_BASE_URL,
            timeout=httpx.Timeout(settings.LLM_TIMEOUT),
        )
    return _http


# ─────────────────────────────────────────────────────────────────────────────
# Startup: wait for Ollama and pull the required models
# ─────────────────────────────────────────────────────────────────────────────

async def wait_for_ollama(retries: int = 30, delay: float = 3.0) -> None:
    """
    Block until Ollama's /api/version endpoint responds.
    Then ensure LLM_MODEL and EMBEDDING_MODEL are pulled.
    """
    client = _get_http()
    for attempt in range(1, retries + 1):
        try:
            r = await client.get("/api/version")
            if r.status_code == 200:
                logger.info("Ollama is reachable ✓")
                await _pull_if_missing(settings.LLM_MODEL)
                await _pull_if_missing(settings.EMBEDDING_MODEL)
                return
        except httpx.ConnectError:
            pass
        logger.warning("Waiting for Ollama … attempt %d/%d", attempt, retries)
        await asyncio.sleep(delay)
    raise RuntimeError("Ollama did not become ready in time")


async def _pull_if_missing(model: str) -> None:
    client = _get_http()
    # Check local models
    r = await client.get("/api/tags")
    if r.status_code == 200:
        names = [m["name"] for m in r.json().get("models", [])]
        # normalise: "llama3.2:3b" matches "llama3.2:3b" or "llama3.2"
        base = model.split(":")[0]
        if any(n.startswith(base) for n in names):
            logger.info("Model '%s' already present", model)
            return
    logger.info("Pulling model '%s' … this may take a while on first boot", model)
    # Stream the pull so docker logs show progress
    async with client.stream(
        "POST", "/api/pull", json={"name": model, "stream": True}
    ) as resp:
        async for line in resp.aiter_lines():
            if line:
                data = json.loads(line)
                if "status" in data:
                    logger.info("[pull] %s", data["status"])
    logger.info("Model '%s' ready ✓", model)


# ─────────────────────────────────────────────────────────────────────────────
# Text generation
# ─────────────────────────────────────────────────────────────────────────────

async def generate_text(prompt: str, *, json_mode: bool = False) -> str:
    """
    Call Ollama /api/generate with Llama 3.2 3B.
    Retries up to 3 times on transient errors.
    """
    client = _get_http()
    payload: dict[str, Any] = {
        "model": settings.LLM_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": settings.LLM_TEMPERATURE,
            "num_predict": settings.LLM_MAX_TOKENS,
        },
    }
    if json_mode:
        payload["format"] = "json"

    for attempt in range(1, 4):
        try:
            r = await client.post("/api/generate", json=payload)
            r.raise_for_status()
            data = r.json()
            return data.get("response", "")
        except (httpx.HTTPStatusError, httpx.ReadTimeout) as exc:
            if attempt == 3:
                raise RuntimeError(f"Ollama generation failed after 3 attempts: {exc}") from exc
            wait = attempt * 2
            logger.warning("Generation attempt %d failed, retrying in %ds", attempt, wait)
            await asyncio.sleep(wait)

    return ""  # unreachable


async def generate_json(prompt: str) -> dict[str, Any]:
    """
    Generate JSON from Llama 3.2 3B.
    Uses Ollama's native json format mode for reliable output.
    """
    raw = await generate_text(prompt, json_mode=True)
    # Belt-and-suspenders: strip any markdown fences the model adds
    cleaned = _extract_json(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse error. Raw response:\n%s", raw)
        raise ValueError(f"LLM returned invalid JSON: {exc}") from exc


def _extract_json(text: str) -> str:
    """Strip markdown code fences and extract first JSON object."""
    # Remove ```json ... ``` or ``` ... ```
    text = re.sub(r"```(?:json)?\s*", "", text).strip().rstrip("`")
    match = re.search(r"\{[\s\S]*\}", text)
    return match.group(0) if match else text


# ─────────────────────────────────────────────────────────────────────────────
# Embeddings
# ─────────────────────────────────────────────────────────────────────────────

async def embed_text(text: str) -> list[float]:
    """Single text → 768-dim embedding via nomic-embed-text."""
    results = await embed_batch([text])
    return results[0]


async def embed_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple texts.
    Ollama's /api/embed (v0.3+) supports batch; falls back to sequential
    /api/embeddings for older Ollama versions.
    """
    client = _get_http()
    # Try newer batch endpoint first
    try:
        r = await client.post(
            "/api/embed",
            json={"model": settings.EMBEDDING_MODEL, "input": texts},
        )
        if r.status_code == 200:
            return r.json()["embeddings"]
    except Exception:
        pass

    # Fallback: sequential
    results: list[list[float]] = []
    for text in texts:
        r = await client.post(
            "/api/embeddings",
            json={"model": settings.EMBEDDING_MODEL, "prompt": text},
        )
        r.raise_for_status()
        results.append(r.json()["embedding"])
    return results
