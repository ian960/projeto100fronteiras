import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { loginLimiter, registerLimiter } from '../../shared/middlewares/rateLimit';
import { authController } from './auth.controller';

export function authRouter(): Router {
  const router = Router();

  router.post('/register', registerLimiter, authController.register);
  router.post('/login', loginLimiter, authController.login);
  router.post('/logout', authController.logout);

  router.get('/me', authenticate, authController.me);
  router.post('/change-password', authenticate, authController.changePassword);

  return router;
}
