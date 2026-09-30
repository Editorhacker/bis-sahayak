import { Router } from 'express';
import { z } from 'zod';
import { validateParams, validateQuery } from '../../middleware/validation.js';
import { labSearchSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/', validateQuery(labSearchSchema), controller.searchLabs);
router.get('/state/:state', validateParams(z.object({ state: z.string().min(1) })), controller.getLabsByState);
router.get('/:id', validateParams(z.object({ id: z.string().min(1) })), controller.getLab);

export default router;