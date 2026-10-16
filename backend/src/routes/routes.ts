import { Router } from 'express';
import { authRouter } from '../modules/auth/auth.routes';
import { usersAdminRouter } from '../modules/users/users.routes';
import {
  authorsAdminRouter,
  authorsColumnistRouter,
  authorsPublicRouter,
} from '../modules/authors/authors.routes';
import {
  categoriesAdminRouter,
  categoriesPublicRouter,
} from '../modules/categories/categories.routes';
import {
  postsAdminRouter,
  postsColumnistRouter,
  postsPublicRouter,
} from '../modules/posts/posts.routes';
import { mediaRouter } from '../modules/media/media.routes';
import { postsController } from '../modules/posts/posts.controller';

export function buildRouter(): Router {
  const router = Router();

  // ── public ──────────────────────────────────────────────────────────────
  router.get('/home', postsController.home);
  router.use('/auth', authRouter());
  router.use('/categories', categoriesPublicRouter());
  router.use('/columnists', authorsPublicRouter());
  router.use('/posts', postsPublicRouter());

  // ── admin ───────────────────────────────────────────────────────────────
  // Each of these routers applies authenticate + authorize(ADMIN) on itself,
  // so a route added inside one later is protected without anyone
  // remembering to guard it.
  router.use('/admin/users', usersAdminRouter());
  router.use('/admin/categories', categoriesAdminRouter());
  router.use('/admin/authors', authorsAdminRouter());
  router.use('/admin/posts', postsAdminRouter());

  // ── columnist ───────────────────────────────────────────────────────────
  router.use('/columnist/posts', postsColumnistRouter());
  router.use('/columnist/profile', authorsColumnistRouter());

  // ── shared ──────────────────────────────────────────────────────────────
  router.use('/media', mediaRouter());

  return router;
}
