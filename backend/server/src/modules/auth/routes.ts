import { Router } from 'express';
import { z } from 'zod';
import { authRateLimit } from '../../middleware/security.js';
import { validateBody } from '../../middleware/validation.js';
import { registerSchema, loginSchema } from '../../utils/validationSchemas.js';
import * as controller from './controller.js';
import { authMiddleware } from '../../middleware/auth.js';

const router = Router();

router.post('/register', authRateLimit, validateBody(registerSchema), controller.register);
router.post('/login', authRateLimit, validateBody(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', controller.logout);
router.get('/me', authMiddleware, controller.me);
router.patch('/me', authMiddleware, validateBody(z.object({
  name: z.string().min(1).max(100).optional(),
  preferredLanguage: z.enum(['en', 'hi', 'mr']).optional(),
})), controller.updateProfile);
router.post('/change-password', authMiddleware, validateBody(z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
})), controller.changePassword);

export default router;