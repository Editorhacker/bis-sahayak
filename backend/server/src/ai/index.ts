/**
 * AI Service Integration Layer
 * ────────────────────────────
 * All AI, RAG, and LLM orchestration lives in the Python FastAPI microservice.
 * This barrel exports the typed HTTP client used to communicate with it.
 */
export * from './client.js';