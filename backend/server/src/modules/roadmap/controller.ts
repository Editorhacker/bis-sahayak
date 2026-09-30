import { db, schema } from '../../db/index.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { z } from 'zod';
import { isValidUUID } from '../../utils/helpers.js';
import { generateRoadmap, regenerateRoadmapPreservingCompleted } from './engine.js';

export const generateRoadmapController = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

  if (!business.profileConfirmed) {
    res.status(400).json({ 
      success: false, 
      error: { code: 'PROFILE_NOT_CONFIRMED', message: 'Please confirm your business profile before generating a roadmap' } 
    });
    return;
  }

  const { roadmapId, steps } = await generateRoadmap(id);

  res.status(201).json({ success: true, data: { roadmapId, steps } });
});

export const getRoadmap = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const id = req.params.id as string;

  if (!isValidUUID(id)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid business ID' } });
    return;
  }

  const [roadmap] = await db
    .select()
    .from(schema.roadmaps)
    .where(and(eq(schema.roadmaps.businessId, id), eq(schema.roadmaps.businessId, req.user.id)))
    .orderBy(desc(schema.roadmaps.version))
    .limit(1);

  if (!roadmap) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Roadmap not found' } });
    return;
  }

  const steps = await db
    .select()
    .from(schema.roadmapSteps)
    .where(eq(schema.roadmapSteps.roadmapId, roadmap.id))
    .orderBy(schema.roadmapSteps.stepOrder);

  const completedCount = steps.filter(s => s.status === 'COMPLETED').length;
  const progress = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  res.json({ success: true, data: { roadmap: { ...roadmap, progress, steps } } });
});

export const updateRoadmapStep = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const roadmapId = req.params.roadmapId as string;
  const stepId = req.params.stepId as string;
  const { status } = req.body;

  if (!isValidUUID(roadmapId) || !isValidUUID(stepId)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid ID' } });
    return;
  }

  const [roadmap] = await db
    .select()
    .from(schema.roadmaps)
    .where(eq(schema.roadmaps.id, roadmapId))
    .limit(1);

  if (!roadmap) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Roadmap not found' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, roadmap.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return;
  }

  const [step] = await db
    .select()
    .from(schema.roadmapSteps)
    .where(eq(schema.roadmapSteps.id, stepId))
    .limit(1);

  if (!step) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Step not found' } });
    return;
  }

  if (step.status === 'COMPLETED' || step.status === 'NOT_APPLICABLE') {
    res.status(400).json({ success: false, error: { code: 'STEP_LOCKED', message: 'Cannot change status of completed or not applicable steps' } });
    return;
  }

  if (status === 'IN_PROGRESS' || status === 'COMPLETED') {
    const deps = step.dependsOn as string[];
    if (deps.length > 0) {
      const depSteps = await db
        .select()
        .from(schema.roadmapSteps)
        .where(inArray(schema.roadmapSteps.id, deps));

      const incompleteDeps = depSteps.filter(s => s.status !== 'COMPLETED' && s.status !== 'NOT_APPLICABLE');
      if (incompleteDeps.length > 0) {
        res.status(400).json({ 
          success: false, 
          error: { code: 'STEP_LOCKED', message: `Cannot start: ${incompleteDeps.length} dependency step(s) not completed` } 
        });
        return;
      }
    }
  }

  const [updated] = await db
    .update(schema.roadmapSteps)
    .set({ status })
    .where(eq(schema.roadmapSteps.id, stepId))
    .returning();

  const allSteps = await db
    .select()
    .from(schema.roadmapSteps)
    .where(eq(schema.roadmapSteps.roadmapId, roadmapId));

  const completedCount = allSteps.filter(s => s.status === 'COMPLETED').length;
  const progress = allSteps.length > 0 ? Math.round((completedCount / allSteps.length) * 100) : 0;

  await db
    .update(schema.roadmaps)
    .set({ progress: progress.toString() })
    .where(eq(schema.roadmaps.id, roadmapId));

  res.json({ success: true, data: { step: updated, progress } });
});

export const getStepWhy = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } });
    return;
  }

  const stepId = req.params.stepId as string;

  if (!isValidUUID(stepId)) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid step ID' } });
    return;
  }

  const [step] = await db
    .select()
    .from(schema.roadmapSteps)
    .where(eq(schema.roadmapSteps.id, stepId))
    .limit(1);

  if (!step) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Step not found' } });
    return;
  }

  const [roadmap] = await db
    .select()
    .from(schema.roadmaps)
    .where(eq(schema.roadmaps.id, step.roadmapId))
    .limit(1);

  if (!roadmap) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Roadmap not found' } });
    return;
  }

  const [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, roadmap.businessId), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  if (!business) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return;
  }

  const requirement = step.requirementId ? await db
    .select()
    .from(schema.requirements)
    .where(eq(schema.requirements.id, step.requirementId))
    .limit(1) : null;

  res.json({
    success: true,
    data: {
      reason: step.reason,
      requirement: requirement?.[0] || null,
      payload: step.payload,
    },
  });
});

export const regenerateRoadmap = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
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

  const [existingRoadmap] = await db
    .select()
    .from(schema.roadmaps)
    .where(eq(schema.roadmaps.businessId, id))
    .orderBy(desc(schema.roadmaps.version))
    .limit(1);

  if (!existingRoadmap) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'No existing roadmap to regenerate' } });
    return;
  }

  const { roadmapId, steps } = await regenerateRoadmapPreservingCompleted(id, existingRoadmap.id);

  res.json({ success: true, data: { roadmapId, steps } });
});