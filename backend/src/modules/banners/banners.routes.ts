import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { bannerStatsLimiter } from '../../shared/middlewares/rateLimit';
import { Role } from '../../shared/types/enums';
import { bannersController } from './banners.controller';

// What the site reads, plus the counters it sends. No login.
export function bannersPublicRouter(): Router {
  const router = Router();

  router.get('/', bannersController.listRunning);
  router.post('/impressions', bannerStatsLimiter, bannersController.impressions);
  router.post('/:id/click', bannerStatsLimiter, bannersController.click);

  return router;
}

export function bannersAdminRouter(): Router {
  const router = Router();

  // Mounted on the router, so a route added below is protected by default.
  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', bannersController.list);
  router.post('/', bannersController.create);
  router.patch('/:id', bannersController.update);
  router.delete('/:id', bannersController.remove);

  return router;
}
