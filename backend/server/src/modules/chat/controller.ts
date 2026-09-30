import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { chatMessageSchema, conversationQuerySchema, uuidParamSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';
import { generateId } from '../../utils/helpers.js';
import { processChatMessage, ChatContext } from './orchestrator.js';
import { db, schema } from '../../db/index.js';
import { eq, desc, and, sql, inArray } from 'drizzle-orm';

const TOKEN_CHUNK_CHARS = 160;
const TOKEN_CHUNK_DELAY_MS = 20;

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > size) {
    const window = remaining.slice(0, size);
    const boundary = window.lastIndexOf(' ');
    const cut = boundary > size / 2 ? boundary : size;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export const sendMessage = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const { conversationId, message, language } = chatMessageSchema.parse(req.body);

  const convId = conversationId || generateId();

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  const send = (event: string, data: Record<string, unknown>): void => {
    if (closed || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const context: ChatContext = {
      conversationId: convId,
      userId: req.user.id,
      businessId: req.query.businessId as string,
      language: language || req.user.preferredLanguage,
    };

    const response = await processChatMessage(message, context);

    send('meta', {
      conversationId: response.conversationId,
      messageId: response.messageId,
      intent: response.intent,
      detectedLanguage: context.language,
    });

    if (response.profileCard) {
      send('profile', {
        profile: response.profileCard,
        questions: response.clarifyingQuestions ?? [],
      });
    }

    for (const chunk of splitIntoChunks(response.answer, TOKEN_CHUNK_CHARS)) {
      if (closed) break;
      send('token', { text: chunk });
      if (!closed) {
        await new Promise((resolve) => setTimeout(resolve, TOKEN_CHUNK_DELAY_MS));
      }
    }

    if (closed) return;

    if (response.citations.length > 0) {
      send('citations', { citations: response.citations });
    }

    if (response.roadmapId) {
      send('roadmap', { roadmapId: response.roadmapId, summary: [] });
    }

    send('done', {
      text: response.answer,
      confidence: response.confidence,
      validated: response.confidence !== 'INSUFFICIENT_EVIDENCE',
      disclaimer: response.disclaimer,
      suggestedActions: response.suggestedActions,
      roadmapId: response.roadmapId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat request failed';
    send('error', { code: 'INTERNAL_ERROR', message });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

export const getConversations = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const conversations = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, req.user.id))
    .orderBy(desc(schema.conversations.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.conversations)
    .where(eq(schema.conversations.userId, req.user.id));

  const total = Number(totalResult[0]?.count || 0);

  const conversationIds = conversations.map((conversation) => conversation.id);
  const stats = conversationIds.length
    ? await db
        .select({
          conversationId: schema.messages.conversationId,
          messageCount: sql<number>`count(*)::int`,
          lastMessageAt: sql<Date | null>`max(${schema.messages.createdAt})`,
          firstMessage: sql<string | null>`(array_agg(${schema.messages.content} order by ${schema.messages.createdAt} asc))[1]`,
        })
        .from(schema.messages)
        .where(inArray(schema.messages.conversationId, conversationIds))
        .groupBy(schema.messages.conversationId)
    : [];

  const statsByConversation = new Map(stats.map((row) => [row.conversationId, row]));

  const items = conversations.map((conversation) => {
    const stat = statsByConversation.get(conversation.id);
    const title = (stat?.firstMessage ?? '').trim().slice(0, 80) || 'New conversation';
    const lastMessageAt = stat?.lastMessageAt ?? conversation.createdAt;

    return {
      ...conversation,
      title,
      lastMessageAt: lastMessageAt ? new Date(lastMessageAt).toISOString() : conversation.createdAt,
      messageCount: stat?.messageCount ?? 0,
    };
  });

  res.json({
    success: true,
    data: { conversations: items },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getConversation = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const id = req.params.id as string;

  const [conversation] = await db
    .select()
    .from(schema.conversations)
    .where(and(eq(schema.conversations.id, id), eq(schema.conversations.userId, req.user.id)))
    .limit(1);

  if (!conversation) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Conversation not found' } });
  }

  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, id))
    .orderBy(schema.messages.createdAt);

  res.json({ success: true, data: { conversation: { ...conversation, messages } } });
});