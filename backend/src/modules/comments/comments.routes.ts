import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { commentLimiter } from '../../shared/middlewares/rateLimit';
import { commentsController } from './comments.controller';

// Reading is public. Writing needs an account, any role.
export function commentsRouter(): Router {
  const router = Router();

  router.get('/', commentsController.list);
  router.post('/', authenticate, commentLimiter, commentsController.create);
  router.patch('/:id', authenticate, commentsController.update);
  router.delete('/:id', authenticate, commentsController.remove);

  return router;
}
