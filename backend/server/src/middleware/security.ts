import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { getEnv } from '../config/env.js';

const env = getEnv();

function clientKey(req: Request): string {
  return ipKeyGenerator(req.ip || 'unknown');
}

export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

const parseCorsOrigin = (corsEnv: string) => {
  if (!corsEnv || corsEnv === '*') {
    return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps or curl) or any origin
      callback(null, true);
    };
  }
  const allowedOrigins = corsEnv.split(',').map((o) => o.trim()).filter(Boolean);
  return (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS origin '${origin}' not allowed`));
    }
  };
};

export const corsMiddleware = cors({
  origin: parseCorsOrigin(env.CORS_ORIGIN || 'http://localhost:5173'),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400,
});

export const globalRateLimit = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many requests, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
  skip: (req: Request) => req.path === '/health',
});

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many auth attempts, please try again later' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: clientKey,
});

export const apiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: { code: 'RATE_LIMIT_EXCEEDED', message: 'API rate limit exceeded' } },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const userId = (req as { user?: { id?: string } }).user?.id;
    return userId ? `user:${userId}` : clientKey(req);
  },
});

export function validateContentType(req: Request, res: Response, next: NextFunction) {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.includes('application/json')) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Content-Type must be application/json' },
      });
    }
  }
  next();
}

export function sanitizeInput(req: Request, res: Response, next: NextFunction) {
  const sanitize = (obj: unknown): unknown => {
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }
    if (Array.isArray(obj)) {
      return obj.map(sanitize);
    }
    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitize(value);
      }
      return sanitized;
    }
    return obj;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.params) req.params = sanitize(req.params) as Record<string, string>;
  // Express 5 exposes `req.query` as a getter-only property that re-parses on
  // every read, so it cannot be assigned to; shadow it with a sanitized value.
  const query = req.query;
  if (query && typeof query === 'object') {
    Object.defineProperty(req, 'query', {
      value: sanitize(query),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  next();
}