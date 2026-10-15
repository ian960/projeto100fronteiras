import type { RequestHandler } from 'express';
import { Forbidden, Unauthenticated } from '../errors/AppError';
import type { Role } from '../types/enums';

// Mounted on the router, not on individual routes:
//
//   router.use(authenticate, authorize(Role.ADMIN));
//
// A route added later inside that router is protected by construction — there
// is no line to forget.
export function authorize(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new Unauthenticated());
    }

    if (!roles.includes(req.user.role)) {
      return next(new Forbidden());
    }

    return next();
  };
}
