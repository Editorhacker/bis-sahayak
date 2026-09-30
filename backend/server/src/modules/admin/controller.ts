import { db, schema } from '../../db/index.js';
import { eq, desc, sql, and, inArray } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { adminSourceUploadSchema, adminIngestSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';
import { generateId } from '../../utils/helpers.js';
import { embedTexts } from '../../ai/client.js';

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
  }
  
  return chunks;
}

async function calculateUnsupportedRate(): Promise<number> {
  const total = await db.select({ count: sql<number>`count(*)` }).from(schema.messages).where(eq(schema.messages.role, 'assistant'));
  const unsupported = await db.select({ count: sql<number>`count(*)` }).from(schema.messages).where(and(eq(schema.messages.role, 'assistant'), eq(schema.messages.confidence, 'INSUFFICIENT_EVIDENCE')));
  
  const t = total[0]?.count || 1;
  const u = unsupported[0]?.count || 0;
  
  return Math.round((u / t) * 100);
}

export const uploadSource = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }

  const data = adminSourceUploadSchema.parse(req.body);

  const [document] = await db
    .insert(schema.documents)
    .values({
      title: data.title,
      docType: data.docType,
      authority: data.authority,
      standardNumber: data.standardNumber,
      sourceUrl: data.sourceUrl,
      version: data.version,
      publishedDate: data.publishedDate ? data.publishedDate : null,
      lastVerifiedAt: new Date().toISOString().split('T')[0],
      licenceNote: data.licenceNote,
      storagePath: `manual/${generateId()}`,
    })
    .returning();

  // Chunk the content and embed
  const chunks = chunkText(data.content, 1000, 200);
  const { embeddings } = await embedTexts(chunks);

  for (let i = 0; i < chunks.length; i++) {
    await db.insert(schema.chunks).values({
      documentId: document.id,
      content: chunks[i],
      embedding: embeddings[i],
      metadata: { chunkIndex: i },
    });
  }

  res.status(201).json({ success: true, data: { document, chunksCreated: chunks.length } });
});

export const ingestDocuments = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }

  const data = adminIngestSchema.parse(req.body);

  let query: any = db.select().from(schema.documents);
  if (data.documentIds?.length) {
    query = query.where(inArray(schema.documents.id, data.documentIds));
  }

  const documents = await query;

  let totalChunks = 0;
  for (const doc of documents) {
    totalChunks += 1;
  }

  res.json({ success: true, data: { documentsProcessed: documents.length, chunksCreated: totalChunks } });
});

export const getMetrics = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }

  const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(schema.users);
  const totalBusinesses = await db.select({ count: sql<number>`count(*)` }).from(schema.businesses);
  const totalConversations = await db.select({ count: sql<number>`count(*)` }).from(schema.conversations);
  const totalMessages = await db.select({ count: sql<number>`count(*)` }).from(schema.messages);
  const totalDocuments = await db.select({ count: sql<number>`count(*)` }).from(schema.documents);
  const totalChunks = await db.select({ count: sql<number>`count(*)` }).from(schema.chunks);

  const feedbackStats = await db
    .select({
      rating: schema.feedback.rating,
      count: sql<number>`count(*)`,
    })
    .from(schema.feedback)
    .groupBy(schema.feedback.rating);

  const unsupportedRate = await calculateUnsupportedRate();

  res.json({
    success: true,
    data: {
      totals: {
        users: totalUsers[0]?.count || 0,
        businesses: totalBusinesses[0]?.count || 0,
        conversations: totalConversations[0]?.count || 0,
        messages: totalMessages[0]?.count || 0,
        documents: totalDocuments[0]?.count || 0,
        chunks: totalChunks[0]?.count || 0,
      },
      feedback: feedbackStats,
      unsupportedAnswerRate: unsupportedRate,
    },
  });
});

export const getSources = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;

  const sources = await db
    .select()
    .from(schema.documents)
    .orderBy(desc(schema.documents.lastVerifiedAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const totalResult = await db.select({ count: sql<number>`count(*)` }).from(schema.documents);

  res.json({
    success: true,
    data: { sources },
    pagination: { page, limit, total: totalResult[0]?.count || 0, totalPages: Math.ceil((totalResult[0]?.count || 0) / limit) },
  });
});