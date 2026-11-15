import { Router } from 'express';
import { contactLimiter } from '../../shared/middlewares/rateLimit';
import { contactController } from './contact.controller';

// Public: anyone can write to the newsroom, with or without an account.
export function contactRouter(): Router {
  const router = Router();

  router.post('/', contactLimiter, contactController.send);

  return router;
}
