import { Router } from 'express';
import { z } from 'zod';
import { validateParams, validateQuery } from '../../middleware/validation.js';
import { uuidParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.get('/', authMiddleware, validateQuery(z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  category: z.string().optional(),
  phase: z.string().optional(),
})), controller.getRequirements);

router.get('/search', authMiddleware, validateQuery(z.object({
  q: z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})), controller.searchRequirements);

router.get('/:id', authMiddleware, validateParams(uuidParamSchema), controller.getRequirement);

router.get('/business/:businessId/applicable', authMiddleware, validateParams(z.object({
  businessId: z.string().uuid(),
})), controller.getApplicableRequirements);

export default router;