import { db, schema } from '../../db/index.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { generateId, isValidUUID } from '../../utils/helpers.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validateParams, validateBody, validateQuery } from '../../middleware/validation.js';
import { applicationCreateSchema, applicationUpdateSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';

export const createApplication = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const data = applicationCreateSchema.parse(req.body);

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, data.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
  }

  const [application] = await db
    .insert(schema.applications)
    .values({
      businessId: business.id,
      requirementId: data.requirementId,
      referenceNumber: data.referenceNumber,
      submittedOn: data.submittedOn ? new Date(data.submittedOn) : null,
      status: data.status,
      notes: data.notes,
      reminderDate: data.reminderDate ? new Date(data.reminderDate) : null,
    } as typeof schema.applications.$inferInsert)
    .returning();

  res.status(201).json({ success: true, data: { application } });
});

export const getApplications = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const businessId = req.query.businessId as string;
  const requirementId = req.query.requirementId as string;

  const conditions = [eq(schema.applications.businessId, businessId)];
  if (requirementId) conditions.push(eq(schema.applications.requirementId, requirementId));

  const applications = await db
    .select()
    .from(schema.applications)
    .where(and(...conditions))
    .orderBy(desc(schema.applications.submittedOn))
    .limit(limit)
    .offset((page - 1) * limit);

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.applications)
    .where(and(...conditions));

  const total = totalResult[0]?.count || 0;

  res.json({
    success: true,
    data: { applications },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

export const getApplication = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid application ID' } });
  }

  const [application] = await db
    .select({
      application: schema.applications,
      requirement: schema.requirements,
    })
    .from(schema.applications)
    .leftJoin(schema.requirements, eq(schema.applications.requirementId, schema.requirements.id))
    .where(eq(schema.applications.id, id))
    .limit(1);

  if (!application) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Application not found' } });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, application.application.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
  }

  res.json({ success: true, data: { application } });
});

export const updateApplication = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const id = req.params.id as string;
  const data = applicationUpdateSchema.parse(req.body);

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid application ID' } });
  }

  const [application] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, id))
    .limit(1);

  if (!application) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Application not found' } });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, application.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
  }

  const updateData: Record<string, unknown> = { ...data };
  if (data.submittedOn) updateData.submittedOn = new Date(data.submittedOn);
  if (data.reminderDate) updateData.reminderDate = new Date(data.reminderDate);

  const [updated] = await db
    .update(schema.applications)
    .set(updateData)
    .where(eq(schema.applications.id, id))
    .returning();

  res.json({ success: true, data: { application: updated } });
});

export const deleteApplication = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid application ID' } });
  }

  const [application] = await db
    .select()
    .from(schema.applications)
    .where(eq(schema.applications.id, id))
    .limit(1);

  if (!application) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Application not found' } });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, application.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
  }

  await db.delete(schema.applications).where(eq(schema.applications.id, id));

  res.json({ success: true, message: 'Application deleted successfully' });
});

export const getPrefillData = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid application ID' } });
  }

  const [application] = await db
    .select({
      application: schema.applications,
      requirement: schema.requirements,
    })
    .from(schema.applications)
    .leftJoin(schema.requirements, eq(schema.applications.requirementId, schema.requirements.id))
    .where(eq(schema.applications.id, id))
    .limit(1);

  if (!application) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Application not found' } });
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, application.application.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
  }

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.businessId, business.id));

  const prefillData = {
    businessName: business.businessName,
    businessType: business.businessType,
    structure: business.structure,
    state: business.state,
    city: business.city,
    premisesType: business.premisesType,
    employeeCount: business.employeeCount,
    expectedTurnover: business.expectedTurnover,
    products: products.map(p => ({
      name: p.name,
      description: p.description,
      category: p.category,
      material: p.material,
      usage: p.usage,
    })),
    requirement: {
      id: application.requirement?.id,
      title: application.requirement?.title,
      applyUrl: application.requirement?.applyUrl,
      documentsRequired: application.requirement?.documentsRequired,
      procedureSteps: application.requirement?.procedureSteps,
    },
  };

  res.json({ success: true, data: { prefillData } });
});