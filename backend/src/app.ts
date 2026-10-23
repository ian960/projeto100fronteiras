import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { isMediaConfigured } from './config/cloudinary';
import { sessionMiddleware } from './config/session';
import { proxyGuard } from './shared/middlewares/proxyGuard';
import { buildRouter } from './routes/routes';
import { notFound } from './shared/middlewares/notFound';
import { errorMiddleware } from './shared/middlewares/error.middleware';

// A factory, not a module-level constant: supertest instantiates the app
// without ever opening a port.
export function createApp() {
  const app = express();

  // Behind Render's proxy, which says in X-Forwarded-Proto that the visitor
  // came over https. express-session only sends the Secure cookie when it
  // trusts that. (The visitor's IP comes from the Worker: see proxyGuard.)
  app.set('trust proxy', 1);

  app.use(helmet());

  // Before the body and the session: a request that did not come through the
  // site's Worker is refused without touching the database.
  app.use(proxyGuard(env.PROXY_SECRET));

  app.use(
    cors({
      origin: env.SITE_URL,
      // The session cookie has to travel, so the origin cannot be a wildcard.
      credentials: true,
    }),
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(sessionMiddleware());

  // First request to make when testing: it also says which optional
  // features this server has switched on.
  app.get('/api/health', (_req, res) => {
    res.json({
      data: {
        ok: true,
        environment: env.NODE_ENV,
        uploads: isMediaConfigured() ? 'cloudinary' : 'disabled',
      },
    });
  });

  app.use('/api', buildRouter());

  // Order matters: unmatched route first, error handler last.
  app.use(notFound);
  app.use(errorMiddleware);

  return app;
}
