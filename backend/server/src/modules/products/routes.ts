import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { productCreateSchema, productUpdateSchema, businessIdParamSchema, productIdParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.post('/', validateBody(productCreateSchema), controller.createProduct);
router.get('/', controller.getProducts);
router.get('/:id', validateParams(productIdParamSchema), controller.getProduct);
router.patch('/:id', validateParams(productIdParamSchema), validateBody(productUpdateSchema), controller.updateProduct);
router.delete('/:id', validateParams(productIdParamSchema), controller.deleteProduct);

export default router;