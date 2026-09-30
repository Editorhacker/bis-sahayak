import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { fromError } from 'zod-validation-error';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromError(error);
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validationError.message },
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      });
    }
  };
}

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Convert query params to proper types
      const query: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(req.query)) {
        if (Array.isArray(value)) {
          query[key] = value[0];
        } else {
          query[key] = value;
        }
      }
      const parsed = schema.parse(query);
      // Use type assertion to avoid TypeScript issues
      (req as any).query = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromError(error);
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validationError.message },
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters' },
      });
    }
  };
}

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // Convert params to proper types (handle string | string[])
      const params: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(req.params)) {
        params[key] = Array.isArray(value) ? value[0] : value;
      }
      const parsed = schema.parse(params);
      // Use type assertion to avoid TypeScript issues
      (req as any).params = parsed;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const validationError = fromError(error);
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: validationError.message },
        });
        return;
      }
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid path parameters' },
      });
    }
  };
}