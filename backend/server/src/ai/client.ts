/**
 * AI Service Client
 * -----------------
 * The ONLY file in TypeScript that touches AI.
 * All actual LLM / RAG logic lives in the Python ai_service.
 *
 * This client:
 *   - Adds the shared internal secret header on every request
 *   - Has a per-request timeout (Llama 3.2 3B on CPU can be slow)
 *   - Raises typed errors that map to HTTP responses
 */

import { getEnv } from '../config/env.js';

const env = getEnv();

const AI_BASE = env.AI_SERVICE_URL;          // e.g. http://ai_service:8000
const SECRET  = env.AI_SERVICE_SECRET;       // shared with Python service
const TIMEOUT = env.AI_SERVICE_TIMEOUT_MS;   // default 120 000 ms

// ─────────────────────────────────────────────────────────────────────────────
// Shared types (mirror Python schemas.py)
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalyzeResponse {
  language: 'en' | 'hi' | 'mr' | 'hinglish';
  normalizedQuery: string;
  intent: string;
  profile: {
    product: { name: string | null; material: string | null; usage: string | null; category: string | null };
    location: { state: string | null; city: string | null };
    businessType: string | null;
    businessStructure: string | null;
    premisesType: string | null;
    employeeCount: number | null;
    expectedTurnover: number | null;
  };
  missingFields: string[];
}

export interface EmbedResponse {
  embeddings: number[][];
}

export interface ChatAIResponse {
  conversation_id: string;
  message_id: string;
  intent: string;
  answer: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  citations: Array<{
    chunkId: number;
    standardNumber: string | null;
    clause: string | null;
    excerpt: string;
    sourceUrl: string | null;
  }>;
  disclaimer: string;
  suggested_actions: string[];
  clarifying_questions?: Array<{ field: string; text: string; options?: string[]; type?: string }>;
  profile_card?: Record<string, unknown>;
  roadmap_id?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function aiPost<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);

  try {
    const res = await fetch(`${AI_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI service error ${res.status}: ${text}`);
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`AI service timed out after ${TIMEOUT}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Analyze a user message → intent + profile */
export function analyzeMessage(message: string): Promise<AnalyzeResponse> {
  return aiPost<AnalyzeResponse>('/analyze', { message });
}

/** Generate embeddings for one or more texts */
export function embedTexts(texts: string[]): Promise<EmbedResponse> {
  return aiPost<EmbedResponse>('/embed', { texts });
}

/** Full chat pipeline (analyze → RAG → generate → validate) */
export function callChatAI(payload: {
  message: string;
  conversation_id: string;
  user_id: string;
  business_id?: string;
  language?: string;
}): Promise<ChatAIResponse> {
  return aiPost<ChatAIResponse>('/chat', payload);
}
