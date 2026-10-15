import type { Role } from '../../shared/types/enums';

export type CreateUserData = {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
};

export type UpdateUserData = {
  name?: string;
  role?: Role;
  active?: boolean;
};

export type FindUsersFilters = {
  role?: Role;
  search?: string;
};
