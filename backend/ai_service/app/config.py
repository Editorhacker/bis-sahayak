"""
Centralised, validated configuration.
All values come from environment variables (injected by Docker Compose).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Ollama ────────────────────────────────────
    OLLAMA_BASE_URL: str = "http://ollama:11434"

    # Chat / generation model (Llama 3.2 3B)
    LLM_MODEL: str = "llama3.2:3b"

    # Embedding model (nomic-embed-text produces 768-dim vectors)
    EMBEDDING_MODEL: str = "nomic-embed-text"
    EMBEDDING_DIMENSIONS: int = 768

    # ── PostgreSQL ────────────────────────────────
    DATABASE_URL: str = "postgresql://postgres:postgres@postgres:5432/business_saarthi"

    # ── Security ──────────────────────────────────
    # Shared secret between TypeScript backend and this service.
    INTERNAL_SECRET: str = "default_internal_secret_change_in_prod"

    # Origin that is allowed to call this service (CORS)
    BACKEND_ORIGIN: str = "http://backend:3000"

    # ── Generation parameters ─────────────────────
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 2048
    LLM_TIMEOUT: int = 120  # seconds

    # ── RAG parameters ────────────────────────────
    RRF_K: int = 60
    FTS_WEIGHT: float = 1.0
    VECTOR_WEIGHT: float = 1.0
    MAX_RETRIEVAL_RESULTS: int = 8

    # ── Misc ──────────────────────────────────────
    LOG_LEVEL: str = "info"


# Singleton – import this everywhere
settings = Settings()
