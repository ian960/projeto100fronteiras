import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/types/enums';
import { authorsController } from './authors.controller';

// Public: only active columnists, plus the author page by slug.
export function authorsPublicRouter(): Router {
  const router = Router();

  router.get('/', authorsController.listColumnists);
  router.get('/:slug', authorsController.getBySlug);

  return router;
}

export function authorsAdminRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', authorsController.list);
  router.get('/:id', authorsController.getById);
  router.post('/', authorsController.create);
  router.patch('/:id', authorsController.update);
  router.delete('/:id', authorsController.remove);

  return router;
}

// A columnist editing their own byline.
export function authorsColumnistRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.COLUMNIST));

  router.patch('/', authorsController.updateMyProfile);

  return router;
}
