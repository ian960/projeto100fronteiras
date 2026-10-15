import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/types/enums';
import { postsController } from './posts.controller';

export function postsPublicRouter(): Router {
  const router = Router();

  // Fixed segments before /:slug, or "by-ids" would be read as a slug.
  router.get('/by-ids', postsController.findByIds);
  router.get('/', postsController.listPublished);
  router.get('/:slug', postsController.getBySlug);

  return router;
}

export function postsAdminRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', postsController.listForPanel);
  router.get('/:id', postsController.getForPanel);
  router.post('/', postsController.create);
  router.patch('/:id', postsController.update);
  router.delete('/:id', postsController.remove);

  router.post('/:id/publish', postsController.publish);
  router.post('/:id/unpublish', postsController.unpublish);
  router.post('/:id/feature', postsController.setFeatured);

  return router;
}

export function postsColumnistRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.COLUMNIST));

  // Scoped to the columnist's own byline inside the service, in the WHERE
  // clause — not filtered after the rows come back.
  router.get('/', postsController.listForPanel);
  router.get('/:id', postsController.getForPanel);
  router.post('/', postsController.createMyColumn);
  router.patch('/:id', postsController.update);
  router.delete('/:id', postsController.remove);

  router.post('/:id/submit', postsController.submitForReview);

  // There is no publish route here, and that is the point: the columnist has
  // no endpoint that can write status = 'published'.

  return router;
}
