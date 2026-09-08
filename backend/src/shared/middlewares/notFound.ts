import type { RequestHandler } from 'express';
import { NotFound } from '../errors/AppError';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFound(`Route ${req.method} ${req.originalUrl} does not exist.`));
};