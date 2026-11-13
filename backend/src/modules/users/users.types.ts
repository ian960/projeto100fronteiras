import type { Role } from '../../shared/types/enums';
import type { IAuthorSummary } from '../authors/authors.types';

// One row of the users table, hash included.
export interface IUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Anything that leaves the API.
//
// Omit is doing real work here: a method declared as returning IUserPublic
// will not compile if it hands back an object that still carries the hash.
export type IUserPublic = Omit<IUser, 'passwordHash'>;

export type IUserWithAuthor = IUserPublic & {
  author?: IAuthorSummary | null;
};

// What the owner of the account sees about themselves (GET/PATCH /auth/me):
// everything public, plus their own profile with the photo as a ready URL.
export type IUserMe = IUserWithAuthor & {
  bio: string | null;
  avatarId: string | null;
  avatarUrl: string | null; // square, centred on the face
};

export type IUserCredentials = Pick<IUser, 'id' | 'email' | 'passwordHash' | 'role' | 'active'>;
