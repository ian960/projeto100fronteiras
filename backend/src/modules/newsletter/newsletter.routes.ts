import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { newsletterLimiter } from '../../shared/middlewares/rateLimit';
import { Role } from '../../shared/types/enums';
import { newsletterController } from './newsletter.controller';

// The reader's side. Subscribing, confirming and leaving need no account;
// "Minha conta" (/me) does.
export function newsletterRouter(): Router {
  const router = Router();

  router.post('/subscribe', newsletterLimiter, newsletterController.subscribe);
  router.post('/confirm', newsletterLimiter, newsletterController.confirm);
  router.post('/unsubscribe', newsletterLimiter, newsletterController.unsubscribe);
  router.post('/unsubscribe/one-click', newsletterLimiter, newsletterController.oneClick);

  router.get('/me', authenticate, newsletterController.getMine);
  router.put('/me', authenticate, newsletterController.setMine);

  return router;
}

export function newsletterAdminRouter(): Router {
  const router = Router();

  // Mounted on the router, so a route added below is protected by default.
  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', newsletterController.overview);
  router.get('/posts', newsletterController.posts);
  router.post('/preview', newsletterController.preview);
  router.post('/test', newsletterController.test);
  router.post('/issues', newsletterController.createIssue);
  router.post('/issues/:id/cancel', newsletterController.cancelIssue);
  router.post('/queue/run', newsletterController.runQueue);

  return router;
}
