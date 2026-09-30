import { db, schema } from '../../db/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateId, isValidUUID } from '../../utils/helpers.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { businessCreateSchema, businessUpdateSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';

export const createBusiness = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const data = businessCreateSchema.parse(req.body);
  const businessId = generateId();

  const [business] = await db
    .insert(schema.businesses)
    .values([{
      id: businessId,
      userId: req.user.id,
      businessName: data.businessName,
      businessType: data.businessType,
      structure: data.structure,
      state: data.state,
      city: data.city,
      premisesType: data.premisesType,
      employeeCount: data.employeeCount,
      expectedTurnover: data.expectedTurnover?.toString(),
    }])
    .returning();

  res.status(201).json({ success: true, data: { business } });
});

export const getBusinesses = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const businesses = await db
    .select()
    .from(schema.businesses)
    .where(eq(schema.businesses.userId, req.user.id))
    .orderBy(desc(schema.businesses.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.businesses)
    .where(eq(schema.businesses.userId, req.user.id));

  const total = totalResult[0]?.count || 0;

  res.json({
    success: true,
    data: { businesses },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getBusiness = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.businessId, business.id));

  res.json({ success: true, data: { business: { ...business, products } } });
});

export const updateBusiness = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const id = req.params.id as string;
  const data = businessUpdateSchema.parse(req.body);

  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.expectedTurnover != null) {
    updateData.expectedTurnover = data.expectedTurnover.toString();
  }
  updateData.updatedAt = new Date();

  const [business] = await db
    .update(schema.businesses)
    .set(updateData)
    .where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, req.user.id)))
    .returning();

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  res.json({ success: true, data: { business } });
});

export const deleteBusiness = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const result = await db
    .delete(schema.businesses)
    .where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, req.user.id)));

  if (result.rowCount === 0) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  res.json({ success: true, message: 'Business deleted successfully' });
});

export const confirmProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  if (!business.businessType || !business.structure || !business.state || !business.city || !business.premisesType || business.employeeCount === null) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Profile incomplete. Please fill all required fields before confirming.' },
    });
    return;
  }

  const [updated] = await db
    .update(schema.businesses)
    .set({ profileConfirmed: true, updatedAt: new Date() })
    .where(eq(schema.businesses.id, id))
    .returning();

  res.json({ success: true, data: { business: updated } });
});