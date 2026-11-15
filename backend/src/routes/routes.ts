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
import { commentsRouter } from '../modules/comments/comments.routes';
import { postsController } from '../modules/posts/posts.controller';
import { seoController } from '../modules/seo/seo.controller';
import { bannersAdminRouter, bannersPublicRouter } from '../modules/banners/banners.routes';
import { contactRouter } from '../modules/contact/contact.routes';
import { newsletterAdminRouter, newsletterRouter } from '../modules/newsletter/newsletter.routes';
import { pushAdminRouter, pushRouter } from '../modules/push/push.routes';

export function buildRouter(): Router {
  const router = Router();

  // ── public ──────────────────────────────────────────────────────────────
  router.get('/home', postsController.home);
  // Addresses and dates of everything public, for sitemap.xml (worker/seo.ts).
  router.get('/sitemap', seoController.sitemap);
  router.use('/auth', authRouter());
  router.use('/categories', categoriesPublicRouter());
  router.use('/columnists', authorsPublicRouter());
  router.use('/posts', postsPublicRouter());
  // Reading is public; writing checks the session inside the router.
  router.use('/comments', commentsRouter());
  // Advertisers' banners running now, and the counts of views and clicks.
  router.use('/banners', bannersPublicRouter());
  // The form on /contato: an e-mail to the newsroom, no account needed.
  router.use('/contact', contactRouter());
  // Opt-in newsletter: subscribe, confirm, leave; "Minha conta" switch.
  router.use('/newsletter', newsletterRouter());
  // Opt-in push notifications: the browser's subscription, no account needed.
  router.use('/push', pushRouter());

  // ── admin ───────────────────────────────────────────────────────────────
  // Each of these routers applies authenticate + authorize(ADMIN) on itself,
  // so a route added inside one later is protected without anyone
  // remembering to guard it.
  router.use('/admin/users', usersAdminRouter());
  router.use('/admin/categories', categoriesAdminRouter());
  router.use('/admin/authors', authorsAdminRouter());
  router.use('/admin/posts', postsAdminRouter());
  router.use('/admin/banners', bannersAdminRouter());
  router.use('/admin/newsletter', newsletterAdminRouter());
  router.use('/admin/push', pushAdminRouter());

  // ── columnist ───────────────────────────────────────────────────────────
  router.use('/columnist/posts', postsColumnistRouter());
  router.use('/columnist/profile', authorsColumnistRouter());

  // ── shared ──────────────────────────────────────────────────────────────
  router.use('/media', mediaRouter());

  return router;
}
