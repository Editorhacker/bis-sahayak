import { Request, Response, NextFunction } from 'express';
import { createRequire } from 'module';
import pino from 'pino';
import { getEnv } from '../config/env.js';

const env = getEnv();

function hasPinoPretty(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    console.warn('pino-pretty is not installed, falling back to JSON logs (npm i -D pino-pretty)');
    return false;
  }
}

export const logger = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === 'development' && hasPinoPretty() ? {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
  } : undefined,
});

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const requestId = crypto.randomUUID();
  
  req.headers['x-request-id'] = requestId;
  res.setHeader('X-Request-ID', requestId);

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      userId: (req as any).user?.id,
    };

    if (res.statusCode >= 500) {
      logger.error(logData, 'Request completed with error');
    } else if (res.statusCode >= 400) {
      logger.warn(logData, 'Request completed with client error');
    } else {
      logger.info(logData, 'Request completed');
    }
  });

  next();
}

export function logEvent(event: string, data: Record<string, unknown>): void {
  logger.info({ event, ...data }, event);
}