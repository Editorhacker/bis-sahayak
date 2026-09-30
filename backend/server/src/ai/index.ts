/**
 * AI layer – all logic lives in the Python ai_service.
 * This barrel re-exports only the HTTP client that talks to it.
 *
 * The old llm.ts / retrieval.ts / validator.ts / prompts.ts files
 * are kept for reference but are NO LONGER used at runtime.
 * Delete them once you're confident the Python service is stable.
 */
export * from './client.js';