import type { RequestHandler } from 'express';
import { Unauthenticated } from '../errors/AppError';
import { authRepository } from '../../modules/auth/auth.repository';

// Loads the session user on every authenticated request.
//
// This hits the database instead of trusting what was written into the session
// at login time, and that is deliberate: it is what makes deactivating a user
// or resetting their password take effect immediately, on the very next
// request, instead of whenever their cookie happens to expire.
export const authenticate: RequestHandler = async (req, _res, next) => {
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

  req.user = {
    id: user.id,
    name: user.name,
    role: user.role,
    authorId: user.author?.id ?? null,
  };

  return next();
};
