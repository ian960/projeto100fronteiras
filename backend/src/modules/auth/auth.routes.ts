import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { loginLimiter, passwordResetLimiter, registerLimiter } from '../../shared/middlewares/rateLimit';
import { authController } from './auth.controller';

export function authRouter(): Router {
  const router = Router();

  router.post('/register', registerLimiter, authController.register);
  router.post('/login', loginLimiter, authController.login);
  router.post('/logout', authController.logout);

  // "Esqueci minha senha": no session, by definition.
  router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
  router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

  router.get('/me', authenticate, authController.me);
  router.patch('/me', authenticate, authController.updateMe);
  router.delete('/me', authenticate, authController.deleteMe);
  router.post('/change-password', authenticate, authController.changePassword);

  return router;
}
