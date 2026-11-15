import { Router } from 'express';
import { authenticate, authenticateAllowingNoPassword } from '../../shared/middlewares/authenticate';
import { loginLimiter, passwordResetLimiter, registerLimiter } from '../../shared/middlewares/rateLimit';
import { authController } from './auth.controller';

export function authRouter(): Router {
  const router = Router();

  router.post('/register', registerLimiter, authController.register);
  router.post('/login', loginLimiter, authController.login);
  router.post('/logout', authController.logout);

  // "Entrar com Google" (auth.google.ts). Plain GETs: the browser navigates
  // to the first, and Google sends it back to the second.
  router.get('/google', loginLimiter, authController.googleStart);
  router.get('/google/callback', loginLimiter, authController.googleCallback);

  // "Esqueci minha senha": no session, by definition.
  router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
  router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

  // These three also work for an account made with Google that has no
  // password yet: the site needs to know who is logged in, the reader must be
  // able to create the password, and to give up and delete the account.
  router.get('/me', authenticateAllowingNoPassword, authController.me);
  router.patch('/me', authenticate, authController.updateMe);
  router.delete('/me', authenticateAllowingNoPassword, authController.deleteMe);
  router.post('/change-password', authenticateAllowingNoPassword, authController.changePassword);

  return router;
}
