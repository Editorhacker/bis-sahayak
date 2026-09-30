import { db, schema } from '../../db/index.js';
import { eq, and } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validateBody, validateParams } from '../../middleware/validation.js';
import { feedbackSchema, uuidParamSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';

export const createFeedback = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const data = feedbackSchema.parse(req.body);

  const [message] = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.id, data.messageId))
    .limit(1);

  if (!message) {
    return res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Message not found' } });
  }

  const [feedback] = await db
    .insert(schema.feedback)
    .values({
      userId: req.user.id,
      messageId: data.messageId,
      rating: data.rating,
      reason: data.reason,
      comment: data.comment,
    })
    .returning();

  res.status(201).json({ success: true, data: { feedback } });
});

export const getFeedback = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
  }

  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;

  const feedback = await db
    .select({
      feedback: schema.feedback,
      message: schema.messages,
    })
    .from(schema.feedback)
    .leftJoin(schema.messages, eq(schema.feedback.messageId, schema.messages.id))
    .where(eq(schema.feedback.userId, req.user.id))
    .orderBy(schema.feedback.id)
    .limit(limit)
    .offset((page - 1) * limit);

  res.json({ success: true, data: { feedback } });
});