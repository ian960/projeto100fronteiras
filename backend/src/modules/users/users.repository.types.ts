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

// What a user may change about themselves. Never role or active.
export type UpdateProfileData = {
  name?: string;
  bio?: string | null;
  avatarId?: string | null;
};

export type FindUsersFilters = {
  role?: Role;
  search?: string;
};
