import { db, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { generateId, isValidUUID } from '../../utils/helpers.js';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { productCreateSchema, productUpdateSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';

export const createProduct = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const pid = req.params.pid as string;
  const data = productCreateSchema.parse(req.body);

  if (!isValidUUID(pid)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, pid), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const productId = generateId();
  const [product] = await db
    .insert(schema.products)
    .values({
      id: productId,
      businessId: pid,
      ...data,
    })
    .returning();

  res.status(201).json({ success: true, data: { product } });
});

export const getProducts = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const pid = req.params.pid as string;

  if (!isValidUUID(pid)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, pid), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const products = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.businessId, pid));

  res.json({ success: true, data: { products } });
});

export const getProduct = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const pid = req.params.pid as string;
  const id = req.params.id as string;

  if (!isValidUUID(pid) || !isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, pid), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const [product] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.id, id), eq(schema.products.businessId, pid)))
    .limit(1);

  if (!product) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Product not found' } });
    return;
  }

  res.json({ success: true, data: { product } });
});

export const updateProduct = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const pid = req.params.pid as string;
  const id = req.params.id as string;
  const data = productUpdateSchema.parse(req.body);

  if (!isValidUUID(pid) || !isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, pid), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const [product] = await db
    .update(schema.products)
    .set(data)
    .where(and(eq(schema.products.id, id), eq(schema.products.businessId, pid)))
    .returning();

  if (!product) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Product not found' } });
    return;
  }

  res.json({ success: true, data: { product } });
});

export const deleteProduct = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const pid = req.params.pid as string;
  const id = req.params.id as string;

  if (!isValidUUID(pid) || !isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid ID' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, pid), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Business not found' } });
    return;
  }

  const result = await db
    .delete(schema.products)
    .where(and(eq(schema.products.id, id), eq(schema.products.businessId, pid)));

  if (result.rowCount === 0) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Product not found' } });
    return;
  }

  res.json({ success: true, message: 'Product deleted successfully' });
});