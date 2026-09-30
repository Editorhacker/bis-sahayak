/**
 * Chat Orchestrator  (refactored)
 * ────────────────────────────────
 * TypeScript only does:
 *   1. Build ChatContext from the HTTP request
 *   2. Call Python AI service via aiClient.callChatAI()
 *   3. Persist conversation + messages to PostgreSQL
 *
 * ALL AI logic (analyze, retrieve, generate, validate) lives in Python.
 */

import { db, schema } from '../../db/index.js';
import { generateId } from '../../utils/helpers.js';
import { callChatAI, ChatAIResponse } from '../../ai/client.js';

export interface ChatContext {
  conversationId: string;
  userId: string;
  businessId?: string;
  language: string;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  intent: string;
  answer: string;
  roadmapId?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE';
  citations: Array<{
    chunkId: number;
    standardNumber: string | null;
    clause: string | null;
    excerpt: string;
    sourceUrl: string | null;
  }>;
  disclaimer: string;
  suggestedActions: string[];
  clarifyingQuestions?: Array<{ field: string; text?: string; question?: string; options?: string[]; type?: string }>;
  profileCard?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────

function normalizeProfileCard(raw?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  const product = (raw.product && typeof raw.product === 'object' && !Array.isArray(raw.product))
    ? (raw.product as Record<string, unknown>)
    : {};
  const location = (raw.location && typeof raw.location === 'object' && !Array.isArray(raw.location))
    ? (raw.location as Record<string, unknown>)
    : {};

  const city = (location.city ?? raw.city) as string | undefined;
  const state = (location.state ?? raw.state) as string | undefined;
  const locParts = [city, state].filter(Boolean);
  const locationStr = typeof raw.location === 'string' && raw.location !== '[object Object]'
    ? raw.location
    : (locParts.length > 0 ? locParts.join(', ') : undefined);

  const productName = (product.name ?? raw.productName ?? raw.businessName) as string | undefined;
  const material = (product.material ?? raw.material) as string | undefined;
  const structure = (raw.structure ?? raw.businessStructure) as string | undefined;
  const workerCount = (raw.workerCount ?? raw.employeeCount) as number | undefined;
  const annualTurnover = (raw.annualTurnover ?? raw.expectedTurnover) as number | undefined;

  return {
    ...raw,
    productName,
    material,
    location: locationStr,
    city,
    state,
    structure,
    businessStructure: structure,
    workerCount,
    employeeCount: workerCount,
    annualTurnover,
    expectedTurnover: annualTurnover,
  };
}

export async function processChatMessage(
  message: string,
  context: ChatContext,
): Promise<ChatResponse> {
  // Delegate everything to the Python AI service
  const aiResult: ChatAIResponse = await callChatAI({
    message,
    conversation_id: context.conversationId,
    user_id: context.userId,
    business_id: context.businessId,
    language: context.language,
  });

  const clarifyingQuestions = aiResult.clarifying_questions?.map((q) => ({
    ...q,
    question: (q as Record<string, unknown>).question as string || q.text || '',
    text: q.text || (q as Record<string, unknown>).question as string || '',
  }));

  const response: ChatResponse = {
    conversationId: context.conversationId,
    messageId: aiResult.message_id,
    intent: aiResult.intent,
    answer: aiResult.answer,
    confidence: aiResult.confidence,
    citations: aiResult.citations,
    disclaimer: aiResult.disclaimer,
    suggestedActions: aiResult.suggested_actions,
    clarifyingQuestions,
    profileCard: normalizeProfileCard(aiResult.profile_card),
    roadmapId: aiResult.roadmap_id,
  };

  // Persist to DB (TypeScript's responsibility – keeps AI service stateless)
  await _persistMessages(context, message, aiResult, response);

  return response;
}

// ─────────────────────────────────────────────────────────────────────────────
// DB persistence
// ─────────────────────────────────────────────────────────────────────────────

async function _persistMessages(
  context: ChatContext,
  userMessage: string,
  aiResult: ChatAIResponse,
  response: ChatResponse,
): Promise<void> {
  // Upsert conversation row
  await db.insert(schema.conversations).values({
    id: context.conversationId,
    userId: context.userId,
    businessId: context.businessId,
    language: context.language,
  }).onConflictDoNothing();

  // User message
  await db.insert(schema.messages).values({
    id: aiResult.message_id,
    conversationId: context.conversationId,
    role: 'user',
    content: userMessage,
    intent: aiResult.intent,
    detectedLanguage: context.language,
    normalizedQuery: userMessage,
    retrievedChunkIds: aiResult.citations.map(c => c.chunkId),
    confidence: aiResult.confidence,
    validated: aiResult.confidence !== 'INSUFFICIENT_EVIDENCE',
  });

  // Assistant message
  await db.insert(schema.messages).values({
    id: generateId(),
    conversationId: context.conversationId,
    role: 'assistant',
    content: aiResult.answer,
    intent: aiResult.intent,
    retrievedChunkIds: aiResult.citations.map(c => c.chunkId),
    confidence: aiResult.confidence,
    validated: aiResult.confidence !== 'INSUFFICIENT_EVIDENCE',
  });
}