export type PaginationParams = {
  page: number;
  limit: number;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
