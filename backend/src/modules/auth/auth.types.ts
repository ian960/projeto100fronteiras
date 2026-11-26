import type { Role } from '../../shared/types/enums';

// What lives in req.user. Kept deliberately small: it is built on every
// authenticated request.
//
// authorIds is here because every ownership check on a column needs it.
// Without it, each permission decision would cost an extra query. Usually one
// author; several when the admin tied more bylines to the login (a columnist
// who also publishes for a friend). Empty for readers and the admin.
export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  authorIds: string[];
};

// Row shape used by authenticate(). Includes the author relation.
export type IAuthSessionRow = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  authors: { id: string }[];
  passwordHash: string | null;
};

// A password recovery link, as found by the hash of its token.
export type IResetTokenRow = {
  id: string;
  expiresAt: Date;
  usedAt: Date | null;
  user: { id: string; name: string; email: string; active: boolean };
};

// Only the login flow ever sees the hash.
export type IAuthCredentialsRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null; // null: Google only
  googleId: string | null;
  role: Role;
  active: boolean;
  authors: { id: string }[];
};
