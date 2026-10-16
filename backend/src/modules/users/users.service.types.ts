import type { Role } from '../../shared/types/enums';

export type ListUsersInput = {
  role?: Role;
  search?: string;
  page: number;
  limit: number;
};

export type PromoteUserInput = {
  name: string;
  slug?: string;
  bio?: string | null;
  photoId?: string | null;
  columnTitle?: string | null;
};

export type UpdateUserInput = {
  name?: string;
  role?: Role;
  active?: boolean;
};
