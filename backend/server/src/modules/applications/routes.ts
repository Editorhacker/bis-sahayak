import { Router } from 'express';
import { z } from 'zod';
import { validateParams, validateBody, validateQuery } from '../../middleware/validation.js';
import { uuidParamSchema, applicationIdParamSchema, applicationCreateSchema, applicationUpdateSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/', validateBody(applicationCreateSchema), controller.createApplication);
router.get('/', validateQuery(z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  businessId: z.string().uuid(),
  requirementId: z.string().optional(),
})), controller.getApplications);
router.get('/:id', validateParams(applicationIdParamSchema), controller.getApplication);
router.patch('/:id', validateParams(applicationIdParamSchema), validateBody(applicationUpdateSchema), controller.updateApplication);
router.delete('/:id', validateParams(applicationIdParamSchema), controller.deleteApplication);
router.get('/:id/prefill', validateParams(applicationIdParamSchema), controller.getPrefillData);

export default router;