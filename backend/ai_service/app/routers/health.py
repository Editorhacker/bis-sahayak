"""
/health  – liveness + readiness probe.
Used by Docker healthcheck and AWS ALB.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import get_pool
from app.ollama_client import _get_http

router = APIRouter()


@router.get("/health")
async def health():
    checks: dict[str, str] = {}

    # DB check
    try:
        pool = get_pool()
        await pool.fetchval("SELECT 1")
        checks["postgres"] = "ok"
    except Exception as exc:
        checks["postgres"] = f"error: {exc}"

    # Ollama check
    try:
        client = _get_http()
        r = await client.get("/api/version")
        checks["ollama"] = "ok" if r.status_code == 200 else f"status {r.status_code}"
    except Exception as exc:
        checks["ollama"] = f"error: {exc}"

    ok = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", "checks": checks},
    )
