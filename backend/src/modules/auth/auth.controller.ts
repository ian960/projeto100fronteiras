import type { Request, Response } from 'express';
import { created, noContent, ok } from '../../shared/http/response';
import { Unauthenticated } from '../../shared/errors/AppError';
import { usersService } from '../users/users.service';
import { authService } from './auth.service';
import { changePasswordSchema, loginSchema, registerSchema } from './auth.schemas';

function requireUser(req: Request) {
  if (!req.user) throw new Unauthenticated();
  return req.user;
}

// Wraps session.regenerate in a promise. Regenerating on login is what
// prevents session fixation: the id the visitor arrived with is discarded.
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

export class AuthController {
  register = async (req: Request, res: Response) => {
    const parsed = registerSchema.parse({ body: req.body });
    const user = await authService.register(parsed.body);

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    return created(res, { user });
  };

  login = async (req: Request, res: Response) => {
    const parsed = loginSchema.parse({ body: req.body });
    const user = await authService.login(parsed.body);

    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    return ok(res, { user });
  };

  logout = async (req: Request, res: Response) => {
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });

    res.clearCookie('portal.sid');
    return noContent(res);
  };

  me = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const user = await usersService.getMe(actor.id);
    return ok(res, { user });
  };

  changePassword = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = changePasswordSchema.parse({ body: req.body });

    await authService.changePassword(actor.id, parsed.body);

    // The wipe above removed this session too. Issue a fresh one so the user
    // is not bounced to the login screen right after changing their password.
    await regenerateSession(req);
    req.session.userId = actor.id;
    await saveSession(req);

    return noContent(res);
  };
}

export const authController = new AuthController();
