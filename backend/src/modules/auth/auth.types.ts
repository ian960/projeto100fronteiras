import type { Role } from '../../shared/types/enums';

// What lives in req.user. Kept deliberately small: it is built on every
// authenticated request.
//
// authorId is here because every ownership check on a column needs it. Without
// it, each permission decision would cost an extra query.
export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  authorId: string | null;
};

// Row shape used by authenticate(). Includes the author relation.
export type IAuthSessionRow = {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  author: { id: string } | null;
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
  passwordHash: string;
  role: Role;
  active: boolean;
  author: { id: string } | null;
};
