import { Router } from 'express';
import { z } from 'zod';
import { validateParams, validateBody, validateQuery } from '../../middleware/validation.js';
import { uuidParamSchema, roadmapIdParamSchema, roadmapStepUpdateSchema, businessIdParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/businesses/:id/roadmap', validateParams(businessIdParamSchema), controller.generateRoadmapController);
router.get('/businesses/:id/roadmap', validateParams(businessIdParamSchema), controller.getRoadmap);
router.post('/businesses/:id/roadmap/regenerate', validateParams(businessIdParamSchema), controller.regenerateRoadmap);
router.patch('/roadmap/:roadmapId/steps/:stepId', validateParams(z.object({
  roadmapId: z.string().uuid(),
  stepId: z.string().uuid(),
})), validateBody(roadmapStepUpdateSchema), controller.updateRoadmapStep);
router.get('/roadmap/steps/:stepId/why', validateParams(z.object({
  stepId: z.string().uuid(),
})), controller.getStepWhy);

export default router;