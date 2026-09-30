import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { fromError } from 'zod-validation-error';
import pino from 'pino';

const logger = pino({ name: 'error-handler' });

export interface AppError extends Error {
  code?: string;
  statusCode?: number;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  logger.error({
    requestId,
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack,
    code: err.code,
    userId: (req as any).user?.id,
  }, 'Request error');

  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected error occurred';

  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = fromError(err).message;
  } else if (err.name === 'UnauthorizedError' || err.message.includes('jwt')) {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid or expired token';
  } else if (err.message.includes('duplicate key') || err.message.includes('unique constraint')) {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Resource already exists';
  } else if (err.message.includes('foreign key')) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Referenced resource not found';
  }

  const response: { success: false; error: { code: string; message: string; details?: unknown } } = {
    success: false,
    error: { code, message },
  };

  if (err.details && env.NODE_ENV !== 'production') {
    response.error.details = err.details;
  }

  res.status(statusCode).json(response);
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { code: 'RESOURCE_NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

const env = { NODE_ENV: process.env.NODE_ENV || 'development' };