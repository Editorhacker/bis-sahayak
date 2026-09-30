import { db, schema } from '../../db/index.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { z } from 'zod';
import { isValidUUID } from '../../utils/helpers.js';
import { generateRoadmap, regenerateRoadmapPreservingCompleted } from './engine.js';

const PHASE_ORDER: Record<string, { name: string; order: number }> = {
  SETUP: { name: 'Setup', order: 1 },
  TAX: { name: 'Tax', order: 2 },
  LOCAL: { name: 'Local', order: 3 },
  BIS: { name: 'BIS', order: 4 },
  SALES: { name: 'Sales', order: 5 },
};

function formatStepForFrontend(step: any) {
  const payload = step.payload || {};
  return {
    id: step.id,
    roadmapId: step.roadmapId,
    requirementId: step.requirementId,
    phase: step.phase,
    order: step.stepOrder,
    stepOrder: step.stepOrder,
    title: step.title,
    description: payload.description || step.reason,
    reason: step.reason,
    status: step.status,
    priority: step.priority,
    authority: payload.authority || null,
    confidence: step.confidence,
    dependsOn: step.dependsOn || [],
    fee: payload.fee ? (typeof payload.fee === 'object' ? payload.fee : {
      amount: typeof payload.fee === 'number' ? payload.fee : 0,
      currency: 'INR',
      condition: payload.feeNote || '',
      source: payload.sourceUrl || 'Official Schedule',
      verifiedOn: payload.lastVerifiedAt || new Date().toISOString(),
    }) : undefined,
    taxNote: payload.taxNote || null,
    documents: Array.isArray(payload.documents)
      ? payload.documents.map((doc: any, idx: number) =>
          typeof doc === 'string'
            ? { id: `doc-${step.id || idx}-${idx}`, name: doc, required: true, completed: false }
            : doc
        )
      : [],
    sources: payload.citations || [],
    applyUrl: payload.applyUrl || null,
    statusUrl: payload.statusUrl || null,
    prefillData: payload.prefillData || {},
    payload: step.payload,
  };
}

function buildRoadmapResponse(roadmap: any, steps: any[]) {
  const formattedSteps = steps.map(formatStepForFrontend);
  const completedCount = formattedSteps.filter(s => s.status === 'COMPLETED').length;
  const progress = formattedSteps.length > 0 ? Math.round((completedCount / formattedSteps.length) * 100) : 0;

  const phaseMap = new Map<string, any[]>();
  for (const s of formattedSteps) {
    const pKey = (s.phase || 'SETUP').toUpperCase();
    if (!phaseMap.has(pKey)) phaseMap.set(pKey, []);
    phaseMap.get(pKey)!.push(s);
  }

  const phases = Object.entries(PHASE_ORDER).map(([phaseKey, phaseMeta]) => ({
    name: phaseMeta.name,
    order: phaseMeta.order,
    steps: (phaseMap.get(phaseKey) || []).sort((a, b) => a.order - b.order),
  })).filter(p => p.steps.length > 0);

  const baseRoadmap = {
    id: roadmap.id,
    businessId: roadmap.businessId,
    version: roadmap.version,
    generatedAt: roadmap.createdAt ? new Date(roadmap.createdAt).toISOString() : new Date().toISOString(),
    progress,
    totalSteps: formattedSteps.length,
    completedSteps: completedCount,
    phases,
    steps: formattedSteps,
    roadmapId: roadmap.id,
  };

  return {
    ...baseRoadmap,
    roadmap: { ...baseRoadmap },
  };
}

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

  const [roadmap] = await db
    .select()
    .from(schema.roadmaps)
    .where(eq(schema.roadmaps.id, roadmapId))
    .limit(1);

  const roadmapData = buildRoadmapResponse(roadmap || { id: roadmapId, businessId: id, version: 1 }, steps);

  res.status(201).json({ success: true, data: roadmapData });
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

  // Check if id is businessId
  let [business] = await db
    .select()
    .from(schema.businesses)
    .where(and(eq(schema.businesses.id, id), eq(schema.businesses.userId, req.user.id)))
    .limit(1);

  let roadmap = null;

  if (business) {
    [roadmap] = await db
      .select()
      .from(schema.roadmaps)
      .where(eq(schema.roadmaps.businessId, business.id))
      .orderBy(desc(schema.roadmaps.version))
      .limit(1);
  } else {
    // Check if id is roadmapId
    [roadmap] = await db
      .select()
      .from(schema.roadmaps)
      .where(eq(schema.roadmaps.id, id))
      .limit(1);

    if (roadmap) {
      [business] = await db
        .select()
        .from(schema.businesses)
        .where(and(eq(schema.businesses.id, roadmap.businessId), eq(schema.businesses.userId, req.user.id)))
        .limit(1);
    }
  }

  if (!business || !roadmap) {
    res.status(404).json({ success: false, error: { code: 'RESOURCE_NOT_FOUND', message: 'Roadmap not found' } });
    return;
  }

  const steps = await db
    .select()
    .from(schema.roadmapSteps)
    .where(eq(schema.roadmapSteps.roadmapId, roadmap.id))
    .orderBy(schema.roadmapSteps.stepOrder);

  const roadmapData = buildRoadmapResponse(roadmap, steps);

  res.json({ success: true, data: roadmapData });
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

  const [roadmap] = await db
    .select()
    .from(schema.roadmaps)
    .where(eq(schema.roadmaps.id, roadmapId))
    .limit(1);

  const roadmapData = buildRoadmapResponse(roadmap || { id: roadmapId, businessId: id, version: existingRoadmap.version + 1 }, steps);

  res.json({ success: true, data: roadmapData });
});