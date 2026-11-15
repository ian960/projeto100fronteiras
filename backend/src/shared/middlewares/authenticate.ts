import type { RequestHandler } from 'express';
import { PasswordRequired, Unauthenticated } from '../errors/AppError';
import { authRepository } from '../../modules/auth/auth.repository';

// Loads the session user on every authenticated request.
//
// This hits the database instead of trusting what was written into the session
// at login time, and that is deliberate: it is what makes deactivating a user
// or resetting their password take effect immediately, on the very next
// request, instead of whenever their cookie happens to expire.
//
// An account made with "Entrar com Google" must create a password before it
// can do anything (ian's rule): every route answers 403 PASSWORD_REQUIRED,
// except the few in auth.routes.ts that use authenticateAllowingNoPassword
// (see who is logged in, create the password, delete the account).
function buildAuthenticate(requirePassword: boolean): RequestHandler {
  return async (req, _res, next) => {
  const userId = req.session.userId;

  if (!userId) {
    return next(new Unauthenticated());
  }

  const user = await authRepository.findSessionUser(userId);

  if (!user || !user.active) {
    // Stale cookie: the account is gone or was disabled.
    req.session.destroy(() => undefined);
    return next(new Unauthenticated('Your session is no longer valid.'));
  }

  if (requirePassword && !user.passwordHash) {
    return next(new PasswordRequired());
  }

  req.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    authorId: user.author?.id ?? null,
  };

  return next();
  };
}

export const authenticate = buildAuthenticate(true);
export const authenticateAllowingNoPassword = buildAuthenticate(false);
