import type { Paginated, PaginationParams } from '../types/pagination';

export function toSkipTake({ page, limit }: PaginationParams) {
  return { skip: (page - 1) * limit, take: limit };
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  { page, limit }: PaginationParams,
): Paginated<T> {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
