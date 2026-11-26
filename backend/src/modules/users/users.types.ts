import type { Role } from '../../shared/types/enums';
import type { IAuthorSummary } from '../authors/authors.types';

// One row of the users table, hash included.
export interface IUser {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null; // null: signs in with Google only
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

// The bylines the login writes under, in the admin's order of authors.
// Usually one; empty for readers and the admin.
export type IUserWithAuthor = IUserPublic & {
  authors: IAuthorSummary[];
};

// What the owner of the account sees about themselves (GET/PATCH /auth/me):
// everything public, plus their own profile with the photo as a ready URL.
export type IUserMe = IUserWithAuthor & {
  bio: string | null;
  avatarId: string | null;
  avatarUrl: string | null; // square, centred on the face
  // Never the hash or the Google id themselves, only whether they exist:
  // "Minha conta" shows "Criar senha" instead of "Trocar senha", and says
  // when the account is linked to Google.
  hasPassword: boolean;
  googleLinked: boolean;
};

export type IUserCredentials = Pick<IUser, 'id' | 'email' | 'passwordHash' | 'role' | 'active'>;
