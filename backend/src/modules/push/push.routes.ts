import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { pushLimiter } from '../../shared/middlewares/rateLimit';
import { Role } from '../../shared/types/enums';
import { pushController } from './push.controller';

// The reader's side: no account needed. Notifications belong to a browser,
// not to a login.
export function pushRouter(): Router {
  const router = Router();

  router.get('/config', pushController.config);
  router.post('/subscribe', pushLimiter, pushController.subscribe);
  router.post('/unsubscribe', pushLimiter, pushController.unsubscribe);

  return router;
}

export function pushAdminRouter(): Router {
  const router = Router();

  // Mounted on the router, so a route added below is protected by default.
  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', pushController.overview);
  router.post('/notifications', pushController.send);
  router.post('/test', pushController.test);

  return router;
}
