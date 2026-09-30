import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { businessCreateSchema, businessUpdateSchema, businessIdParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/', validateBody(businessCreateSchema), controller.createBusiness);
router.get('/', validateQuery(z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})), controller.getBusinesses);
router.get('/:id', validateParams(businessIdParamSchema), controller.getBusiness);
router.patch('/:id', validateParams(businessIdParamSchema), validateBody(businessUpdateSchema), controller.updateBusiness);
router.delete('/:id', validateParams(businessIdParamSchema), controller.deleteBusiness);
router.post('/:id/confirm-profile', validateParams(businessIdParamSchema), controller.confirmProfile);

export default router;