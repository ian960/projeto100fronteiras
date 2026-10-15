import type { Response } from 'express';
import type { Paginated } from '../types/pagination';

export function ok<T>(res: Response, data: T, statusCode = 200) {
  return res.status(statusCode).json({ data });
}

export function created<T>(res: Response, data: T) {
  return res.status(201).json({ data });
}

export function noContent(res: Response) {
  return res.status(204).send();
}

export function paginated<T>(res: Response, result: Paginated<T>) {
  return res.status(200).json({
    data: { items: result.items },
    meta: {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
}
