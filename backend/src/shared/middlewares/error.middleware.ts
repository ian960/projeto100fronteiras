import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { logger } from '../utils/logger';
import { isProduction } from '../../config/env';

type PrismaKnownError = { code: string; meta?: Record<string, unknown> };

function isPrismaKnownError(err: unknown): err is PrismaKnownError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as PrismaKnownError).code === 'string' &&
    (err as PrismaKnownError).code.startsWith('P')
  );
}

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, fields: err.fields },
    });
  }

  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      fields[issue.path.join('.')] = issue.message;
    }

    return res.status(422).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request data.', fields },
    });
  }

  if (isPrismaKnownError(err)) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'This value is already in use.' },
      });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        error: { code: 'CONFLICT', message: 'This record is referenced by others.' },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Resource not found.' },
      });
    }
  }

  logger.error('Unhandled error', { err, method: req.method, url: req.originalUrl });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error. Please try again.',
      ...(isProduction ? {} : { debug: String(err) }),
    },
  });
};