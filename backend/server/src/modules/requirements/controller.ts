import { db, schema } from '../../db/index.js';
import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { z } from 'zod';
import { isValidUUID } from '../../utils/helpers.js';

export const getRequirements = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const category = req.query.category as string;
  const phase = req.query.phase as string;

  const conditions = [];
  if (category) conditions.push(eq(schema.requirements.category, category));
  if (phase) conditions.push(eq(schema.requirements.phase, phase));

  const requirements = await db
    .select()
    .from(schema.requirements)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(schema.requirements.priority), schema.requirements.id)
    .limit(limit)
    .offset((page - 1) * limit);

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.requirements)
    .where(conditions.length ? and(...conditions) : undefined);

  const total = totalResult[0]?.count || 0;

  res.json({
    success: true,
    data: { requirements },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getRequirement = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const id = req.params.id as string;

  const [requirement] = await db
    .select()
    .from(schema.requirements)
    .where(eq(schema.requirements.id, id))
    .limit(1);

  if (!requirement) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Requirement not found' } });
    return;
  }

  const [applicability] = await db
    .select()
    .from(schema.applicabilityRules)
    .where(eq(schema.applicabilityRules.requirementId, id))
    .limit(1);

  const fees = await db
    .select()
    .from(schema.fees)
    .where(eq(schema.fees.requirementId, id));

  const deps = await db
    .select({ dependsOn: schema.requirementDeps.dependsOn })
    .from(schema.requirementDeps)
    .where(eq(schema.requirementDeps.requirementId, id));

  res.json({
    success: true,
    data: { requirement: { ...requirement, applicability, fees, dependsOn: deps.map(d => d.dependsOn) } },
  });
});

export const searchRequirements = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  const q = req.query.q as string;
  const limit = parseInt(req.query.limit as string) || 10;

  if (!q || q.length < 2) {
    res.json({ success: true, data: { requirements: [] } });
    return;
  }

  const requirements = await db
    .select()
    .from(schema.requirements)
    .where(
      or(
        ilike(schema.requirements.title, `%${q}%`),
        ilike(schema.requirements.description, `%${q}%`),
        ilike(schema.requirements.category, `%${q}%`),
      )
    )
    .limit(limit);

  res.json({ success: true, data: { requirements } });
});

export const getApplicableRequirements = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const businessId = req.params.businessId as string;

  if (!isValidUUID(businessId)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.businessId, businessId));

  const profile = {
    businessType: business.businessType,
    structure: business.structure,
    state: business.state,
    city: business.city,
    premisesType: business.premisesType,
    employeeCount: business.employeeCount,
    expectedTurnover: business.expectedTurnover,
    productCategories: products.map(p => p.category).filter(Boolean),
    productMaterials: products.map(p => p.material).filter(Boolean),
    productUsages: products.map(p => p.usage).filter(Boolean),
  };

  res.json({ success: true, data: { profile } });
});