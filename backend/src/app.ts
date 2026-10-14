import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { isStorageConfigured } from './config/storage';
import { sessionMiddleware } from './config/session';
import { buildRouter } from './routes/routes';
import { notFound } from './shared/middlewares/notFound';
import { errorMiddleware } from './shared/middlewares/error.middleware';

// A factory, not a module-level constant: supertest instantiates the app
// without ever opening a port.
export function createApp() {
  const app = express();

  // Behind nginx or Cloudflare, so the client IP arrives in X-Forwarded-For.
  // The rate limiter and the secure cookie both depend on this being set.
  app.set('trust proxy', 1);

  app.use(helmet());

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
        uploads: isStorageConfigured() ? 'r2' : 'disabled',
      },
    });
  });

  app.use('/api', buildRouter());

  // Order matters: unmatched route first, error handler last.
  app.use(notFound);
  app.use(errorMiddleware);

  return app;
}
