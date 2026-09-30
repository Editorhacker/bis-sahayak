import { db, schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, generateId } from '../../utils/helpers.js';
import { generateTokens, setAuthCookies, clearAuthCookies, AuthenticatedRequest } from '../../middleware/auth.js';
import { Request, Response } from 'express';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { registerSchema, loginSchema } from '../../utils/validationSchemas.js';
import { z } from 'zod';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const data = registerSchema.parse(req.body);
  
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, data.email))
    .limit(1);

  if (existing[0]) {
    return res.status(409).json({
      success: false,
      error: { code: 'CONFLICT', message: 'Email already registered' },
    });
  }

  const passwordHash = await hashPassword(data.password);
  const userId = generateId();

  const [user] = await db
    .insert(schema.users)
    .values({
      id: userId,
      name: data.name,
      email: data.email,
      passwordHash,
      preferredLanguage: data.preferredLanguage,
    })
    .returning({ id: schema.users.id, email: schema.users.email, role: schema.users.role, preferredLanguage: schema.users.preferredLanguage });

  const { accessToken, refreshToken } = await generateTokens(user.id, user.email, user.role);
  setAuthCookies(res, accessToken, refreshToken);

  res.status(201).json({
    success: true,
    data: { user: { id: user.id, email: user.email, role: user.role, preferredLanguage: user.preferredLanguage }, accessToken },
    message: 'Registration successful',
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, data.email))
    .limit(1);

  if (!user || !(await verifyPassword(user.passwordHash, data.password))) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid email or password' },
    });
  }

  const { accessToken, refreshToken } = await generateTokens(user.id, user.email, user.role);
  setAuthCookies(res, accessToken, refreshToken);

  res.json({
    success: true,
    data: { user: { id: user.id, email: user.email, role: user.role, preferredLanguage: user.preferredLanguage }, accessToken },
    message: 'Login successful',
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refresh_token;
  
  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Refresh token required' },
    });
  }

  try {
    const { jwtVerify } = await import('jose');
    const { payload } = await jwtVerify(refreshToken, new TextEncoder().encode(process.env.JWT_REFRESH_SECRET!));
    
    if (payload.type !== 'refresh') throw new Error('Invalid token type');

    const [user] = await db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, preferredLanguage: schema.users.preferredLanguage })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub as string))
      .limit(1);

    if (!user) throw new Error('User not found');

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user.id, user.email, user.role);
    setAuthCookies(res, accessToken, newRefreshToken);

    res.json({
      success: true,
      data: { user, accessToken },
      message: 'Token refreshed',
    });
  } catch {
    clearAuthCookies(res);
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' },
    });
  }
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  clearAuthCookies(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

export const me = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' },
    });
  }

  res.json({
    success: true,
    data: { user: req.user },
  });
});

export const updateProfile = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' },
    });
  }

  const updateSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    preferredLanguage: z.enum(['en', 'hi', 'mr']).optional(),
  });

  const data = updateSchema.parse(req.body);

  const [user] = await db
    .update(schema.users)
    .set(data)
    .where(eq(schema.users.id, req.user.id))
    .returning({ id: schema.users.id, name: schema.users.name, email: schema.users.email, role: schema.users.role, preferredLanguage: schema.users.preferredLanguage });

  res.json({ success: true, data: { user } });
});

export const changePassword = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Not authenticated' },
    });
  }

  const schema_ = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(128),
  });

  const data = schema_.parse(req.body);

  const [user] = await db
    .select({ passwordHash: schema.users.passwordHash })
    .from(schema.users)
    .where(eq(schema.users.id, req.user.id))
    .limit(1);

  if (!user || !(await verifyPassword(user.passwordHash, data.currentPassword))) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Current password is incorrect' },
    });
  }

  const newHash = await hashPassword(data.newPassword);
  await db
    .update(schema.users)
    .set({ passwordHash: newHash })
    .where(eq(schema.users.id, req.user.id));

  res.json({ success: true, message: 'Password changed successfully' });
});