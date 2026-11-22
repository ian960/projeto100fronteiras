import { Router } from 'express';
import { authenticate } from '../../shared/middlewares/authenticate';
import { authorize } from '../../shared/middlewares/authorize';
import { Role } from '../../shared/types/enums';
import { usersController } from './users.controller';

export function usersAdminRouter(): Router {
  const router = Router();

  router.use(authenticate, authorize(Role.ADMIN));

  router.get('/', usersController.list);
  router.get('/:id', usersController.getById);
  router.post('/:id/promote', usersController.promote);
  router.put('/:id/author', usersController.linkAuthor);
  router.patch('/:id', usersController.update);
  router.delete('/:id', usersController.remove);
  router.post('/:id/reset-password', usersController.resetPassword);

  return router;
}
