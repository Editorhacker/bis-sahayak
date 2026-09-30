"""
Async PostgreSQL connection pool (asyncpg).
Used by the RAG retrieval layer for FTS + vector queries.
"""

import asyncpg
import logging

from app.config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None


async def init_db_pool() -> None:
    global _pool
    _pool = await asyncpg.create_pool(
        dsn=settings.DATABASE_URL,
        min_size=2,
        max_size=10,
        command_timeout=30,
    )
    # Register pgvector codec so asyncpg can handle vector[] columns
    async with _pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.set_type_codec(
            "vector",
            encoder=_encode_vector,
            decoder=_decode_vector,
            schema="public",
            format="text",
        )
    logger.info("PostgreSQL pool ready")


async def close_db_pool() -> None:
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised – call init_db_pool() first")
    return _pool


# ── pgvector text codec helpers ───────────────────────────────────────────────

def _encode_vector(value: list[float]) -> str:
    return "[" + ",".join(str(v) for v in value) + "]"


def _decode_vector(text: str) -> list[float]:
    return [float(x) for x in text.strip("[]").split(",")]
