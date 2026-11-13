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

// What anyone may change about their own account. No role, no active, no email.
export type UpdateMeInput = {
  name?: string;
  bio?: string | null;
  avatarId?: string | null;
};

export type UpdateUserInput = {
  name?: string;
  role?: Role;
  active?: boolean;
};
