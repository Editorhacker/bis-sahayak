import { db, schema } from '../../db/index.js';
import { eq, and, ilike, or, sql } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validateParams, validateQuery } from '../../middleware/validation.js';
import { labSearchSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';

export const searchLabs = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const { state, city, test, page, limit } = labSearchSchema.parse(req.query);

  const conditions = [];
  if (state) conditions.push(eq(schema.labs.state, state));
  if (city) conditions.push(eq(schema.labs.city, city));
  if (test) conditions.push(sql`${schema.labs.capabilities} @> ARRAY[${test}]`);

  const labs = await db
    .select()
    .from(schema.labs)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(schema.labs.state, schema.labs.city, schema.labs.name)
    .limit(limit)
    .offset((page - 1) * limit);

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.labs)
    .where(conditions.length ? and(...conditions) : undefined);

  const total = totalResult[0]?.count || 0;

  res.json({
    success: true,
    data: { labs },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getLab = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;

  const [lab] = await db
    .select()
    .from(schema.labs)
    .where(eq(schema.labs.id, parseInt(id)))
    .limit(1);

  if (!lab) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Lab not found' } });
  }

  res.json({ success: true, data: { lab } });
});

export const getLabsByState = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const state = req.params.state as string;

  const labs = await db
    .select()
    .from(schema.labs)
    .where(eq(schema.labs.state, state))
    .orderBy(schema.labs.city, schema.labs.name);

  res.json({ success: true, data: { labs } });
});