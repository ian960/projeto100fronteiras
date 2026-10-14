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

export type IUserCredentials = Pick<IUser, 'id' | 'email' | 'passwordHash' | 'role' | 'active'>;
