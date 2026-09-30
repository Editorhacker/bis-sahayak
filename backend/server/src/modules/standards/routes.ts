import { Router } from 'express';
import { z } from 'zod';
import { validateParams, validateQuery, validateBody } from '../../middleware/validation.js';
import { standardSearchSchema, standardRecommendSchema, uuidParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/search', validateQuery(standardSearchSchema), controller.searchStandardsController);
router.get('/recommend', validateBody(standardRecommendSchema), controller.recommendStandard);
router.get('/:standardNumber', validateParams(z.object({ standardNumber: z.string().min(1) })), controller.getStandard);
router.get('/:standardNumber/chunks', validateParams(z.object({ standardNumber: z.string().min(1) })), validateQuery(z.object({
  section: z.string().optional(),
  clause: z.string().optional(),
})), controller.getStandardChunks);

export default router;