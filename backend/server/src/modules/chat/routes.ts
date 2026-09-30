import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../../middleware/validation.js';
import { chatMessageSchema, conversationQuerySchema, uuidParamSchema } from '../../utils/validationSchemas.js';
import { authMiddleware } from '../../middleware/auth.js';
import * as controller from './controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/message', validateBody(chatMessageSchema), controller.sendMessage);

export default router;

// Mounted at /api/v1 so history lives at /conversations and /conversations/:id
// as specified in the API contract.
export const conversationRoutes = Router();

conversationRoutes.use(authMiddleware);

conversationRoutes.get('/conversations', validateQuery(conversationQuerySchema), controller.getConversations);
conversationRoutes.get('/conversations/:id', validateParams(uuidParamSchema), controller.getConversation);
