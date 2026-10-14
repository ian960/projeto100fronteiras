import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/types/enums';
import { categoriesController } from './categories.controller';

export function categoriesPublicRouter(): Router {
  const router = Router();

  router.get('/', categoriesController.listPublic);
  router.get('/:slug', categoriesController.getBySlug);

  return router;
}

export function categoriesAdminRouter(): Router {
  const router = Router();

  // Mounted on the router, so a route added below is protected by default.
  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', categoriesController.list);
  router.get('/:id', categoriesController.getById);
  router.post('/', categoriesController.create);
  router.patch('/:id', categoriesController.update);
  router.delete('/:id', categoriesController.remove);

  return router;
}
