import { db, schema } from '../../db/index.js';
import { eq, and, ilike, or, desc } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { standardSearchSchema, standardRecommendSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';
import { searchStandards, getStandardByNumber, getChunksByStandard, formatContextForLLM } from '../../ai/retrieval.js';
import { llmProvider } from '../../ai/llm.js';
import { ANSWER_GENERATOR_PROMPT } from '../../ai/prompts.js';
import { validateAnswer } from '../../ai/validator.js';

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