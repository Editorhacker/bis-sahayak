import { Request, Response, NextFunction } from 'express';
import { jwtVerify, JWTPayload, SignJWT } from 'jose';
import { getEnv } from '../config/env.js';
import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';

const env = getEnv();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    preferredLanguage: string;
  };
}

const JWT_SECRET = new TextEncoder().encode(env.JWT_SECRET);

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const accessToken = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
    
    if (!accessToken) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
      return;
    }

    const { payload } = await jwtVerify(accessToken, JWT_SECRET);
    
    const user = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        role: schema.users.role,
        preferredLanguage: schema.users.preferredLanguage,
      })
      .from(schema.users)
      .where(eq(schema.users.id, payload.sub as string))
      .limit(1);

    if (!user[0]) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'User not found' },
      });
      return;
    }

    req.user = user[0];
    next();
  } catch (error) {
    if (error instanceof Error && error.message.includes('expired')) {
      res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Token expired' },
      });
      return;
    }
    res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
      return;
    }

    next();
  };
}

export function optionalAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  const accessToken = req.cookies?.access_token || req.headers.authorization?.replace('Bearer ', '');
  
  if (!accessToken) {
    next();
    return;
  }

  jwtVerify(accessToken, JWT_SECRET)
    .then(async ({ payload }) => {
      const user = await db
        .select({
          id: schema.users.id,
          email: schema.users.email,
          role: schema.users.role,
          preferredLanguage: schema.users.preferredLanguage,
        })
        .from(schema.users)
        .where(eq(schema.users.id, payload.sub as string))
        .limit(1);
      
      if (user[0]) req.user = user[0];
      next();
    })
    .catch(() => next());
}

export async function generateTokens(userId: string, email: string, role: string): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await new SignJWT({ sub: userId, email, role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_EXPIRY)
    .sign(JWT_SECRET);

  const refreshToken = await new SignJWT({ sub: userId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(env.JWT_REFRESH_EXPIRY)
    .sign(new TextEncoder().encode(env.JWT_REFRESH_SECRET));

  return { accessToken, refreshToken };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const isProduction = env.NODE_ENV === 'production';
  
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  });

  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response): void {
  const isProduction = env.NODE_ENV === 'production';
  
  res.cookie('access_token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 0,
    path: '/',
  });

  res.cookie('refresh_token', '', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 0,
    path: '/',
  });
}