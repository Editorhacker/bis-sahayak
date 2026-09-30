import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../../middleware/validation.js';
import { adminSourceUploadSchema, adminIngestSchema, uuidParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware, requireRole } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware, requireRole('ADMIN'));

router.post('/sources', validateBody(adminSourceUploadSchema), controller.uploadSource);
router.post('/ingest', validateBody(adminIngestSchema), controller.ingestDocuments);
router.get('/metrics', controller.getMetrics);
router.get('/sources', validateQuery(z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})), controller.getSources);

export default router;