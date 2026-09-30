import { Router } from 'express';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import { feedbackSchema, uuidParamSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/', validateBody(feedbackSchema), controller.createFeedback);
router.get('/', validateQuery(z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})), controller.getFeedback);

export default router;