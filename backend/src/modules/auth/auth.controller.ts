import type { Request, Response } from 'express';
import { created, noContent, ok } from '../../shared/http/response';
import { Conflict, Unauthenticated } from '../../shared/errors/AppError';
import { logger } from '../../shared/utils/logger';
import { Role } from '../../shared/types/enums';
import { usersService } from '../users/users.service';
import { authService } from './auth.service';
import {
  GOOGLE_LOGIN_TTL_MS,
  finishGoogleLogin,
  isGoogleLoginConfigured,
  sameString,
  startGoogleLogin,
} from './auth.google';
import {
  changePasswordSchema,
  deleteMeSchema,
  forgotPasswordSchema,
  googleStartSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateMeSchema,
} from './auth.schemas';

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

  // "Entrar com Google", step 1: off to Google's account picker. A plain
  // link on the site (not fetch), so the whole page goes.
  googleStart = async (req: Request, res: Response) => {
    if (!isGoogleLoginConfigured()) return res.redirect('/entrar?erro=google-indisponivel');

    const parsed = googleStartSchema.parse({ query: req.query });
    const { pending, url } = startGoogleLogin(parsed.query.proxima ?? null);

    req.session.googleLogin = pending;
    await saveSession(req);

    return res.redirect(url);
  };

  // Step 2: Google sends the reader back here. Always ends in a redirect to
  // a page of the site, never in JSON: the reader is looking at this address.
  googleCallback = async (req: Request, res: Response) => {
    const pending = req.session.googleLogin;
    // Single use, whatever happens next.
    delete req.session.googleLogin;

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    // No pending login (cookie lost, or a link someone was sent), a state
    // that is not ours (CSRF), too old, or the reader pressed "Cancel".
    const usable =
      pending &&
      code &&
      state &&
      sameString(state, pending.state) &&
      Date.now() - pending.startedAt < GOOGLE_LOGIN_TTL_MS;

    if (!usable) {
      if (pending) await saveSession(req);
      return res.redirect(req.query.error === 'access_denied' ? '/entrar' : '/entrar?erro=google');
    }

    const profile = await finishGoogleLogin(code, pending.verifier, pending.nonce);
    if (!profile) {
      await saveSession(req);
      return res.redirect('/entrar?erro=google');
    }

    let user;
    try {
      user = await authService.loginWithGoogle(profile);
    } catch (err) {
      await saveSession(req);
      if (err instanceof Unauthenticated) return res.redirect('/entrar?erro=google-desativada');
      if (err instanceof Conflict) return res.redirect('/entrar?erro=google-outra-conta');
      logger.error('Google login failed', err);
      return res.redirect('/entrar?erro=google');
    }

    // A new session id, exactly as for the password login.
    await regenerateSession(req);
    req.session.userId = user.id;
    await saveSession(req);

    const inNewsroom = user.role === Role.ADMIN || user.role === Role.COLUMNIST;
    const next = pending.next ?? (inNewsroom ? '/painel' : '/');

    // No password yet (first time with Google): creating one comes first.
    if (!user.hasPassword) {
      return res.redirect(`/criar-senha?proxima=${encodeURIComponent(next)}`);
    }
    return res.redirect(next);
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

  updateMe = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = updateMeSchema.parse({ body: req.body });
    const user = await usersService.updateMe(actor, parsed.body);
    return ok(res, { user });
  };

  // Always 204, account or not: see AuthService.forgotPassword.
  forgotPassword = async (req: Request, res: Response) => {
    const parsed = forgotPasswordSchema.parse({ body: req.body });
    await authService.forgotPassword(parsed.body);
    return noContent(res);
  };

  resetPassword = async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.parse({ body: req.body });
    await authService.resetPassword(parsed.body);
    return noContent(res);
  };

  deleteMe = async (req: Request, res: Response) => {
    const actor = requireUser(req);
    const parsed = deleteMeSchema.parse({ body: req.body });

    await authService.confirmDeletion(actor.id, parsed.body.password);
    await usersService.deleteAccount(actor.id);

    // The service already wiped the sessions in the database; this drops the
    // one in memory and the cookie.
    await new Promise<void>((resolve, reject) => {
      req.session.destroy((err) => (err ? reject(err) : resolve()));
    });
    res.clearCookie('portal.sid');
    return noContent(res);
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
