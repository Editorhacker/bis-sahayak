import { db, schema } from '../../db/index.js';
import { eq, and, ilike, or } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { standardSearchSchema, standardRecommendSchema } from '../../utils/validationSchemas.js';

export async function searchStandards(query: string, limit = 10) {
  const conditions = [
    or(
      ilike(schema.standards.standardNumber, `%${query}%`),
      ilike(schema.standards.title, `%${query}%`),
      ilike(schema.standards.scope, `%${query}%`)
    ),
    eq(schema.standards.status, 'active'),
  ];

  return db
    .select()
    .from(schema.standards)
    .where(and(...conditions))
    .limit(limit);
}

export async function getStandardByNumber(standardNumber: string) {
  return db
    .select()
    .from(schema.standards)
    .where(eq(schema.standards.standardNumber, standardNumber))
    .limit(1);
}

export async function getChunksByStandard(standardNumber: string) {
  return db
    .select({
      chunkId: schema.chunks.id,
      content: schema.chunks.content,
      section: schema.chunks.section,
      clause: schema.chunks.clause,
      page: schema.chunks.page,
      standardNumber: schema.documents.standardNumber,
      sourceUrl: schema.documents.sourceUrl,
    })
    .from(schema.chunks)
    .innerJoin(schema.documents, eq(schema.chunks.documentId, schema.documents.id))
    .where(eq(schema.documents.standardNumber, standardNumber))
    .orderBy(schema.chunks.page, schema.chunks.section);
}

export const searchStandardsController = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { q, limit } = standardSearchSchema.parse(req.query);

  const standards = await searchStandards(q, limit);

  res.json({ success: true, data: { standards } });
});

export const getStandard = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const standardNumber = req.params.standardNumber as string;

  const standard = await getStandardByNumber(standardNumber);
  if (!standard[0]) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Standard not found' } });
    return;
  }

  const chunks = await getChunksByStandard(standardNumber);

  res.json({ success: true, data: { standard: standard[0], chunks } });
});

export const recommendStandard = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const data = standardRecommendSchema.parse(req.body);

  const query = `${data.productDescription} ${data.productCategory || ''} ${data.material || ''} ${data.usage || ''}`.trim();
  
  if (!query) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Product description required' } });
    return;
  }

  const results = await searchStandards(query, 10);
  
  if (results.length === 0) {
    res.json({
      success: true,
      data: { recommendations: [], message: 'No matching standards found. Please verify with BIS directly.' },
    });
    return;
  }

  const recommendations = results.map(r => ({
    standardNumber: r.standardNumber,
    title: r.title,
    scope: r.scope,
    status: r.status,
    confidence: 'MEDIUM',
  }));

  res.json({ success: true, data: { recommendations } });
});

export const getStandardChunks = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const standardNumber = req.params.standardNumber as string;
  const section = req.query.section as string;
  const clause = req.query.clause as string;

  let chunks = await getChunksByStandard(standardNumber);
  
  if (section) {
    chunks = chunks.filter(c => c.section?.toLowerCase().includes(section.toLowerCase()));
  }
  if (clause) {
    chunks = chunks.filter(c => c.clause?.toLowerCase().includes(clause.toLowerCase()));
  }

  res.json({ success: true, data: { chunks } });
});