import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env, isTest } from './config/env';
import { isMediaConfigured } from './config/cloudinary';
import { sessionMiddleware } from './config/session';
import { isGoogleLoginConfigured } from './modules/auth/auth.google';
import { builtSiteDir, siteMiddleware } from './site/site';
import { buildRouter } from './routes/routes';
import { notFound } from './shared/middlewares/notFound';
import { errorMiddleware } from './shared/middlewares/error.middleware';

// A factory, not a module-level constant: supertest instantiates the app
// without ever opening a port.
export function createApp() {
  const app = express();

  // Behind Render's proxy, which says in X-Forwarded-Proto that the visitor
  // came over https and in X-Forwarded-For who the visitor is. express-session
  // only sends the Secure cookie when it trusts that.
  app.set('trust proxy', 1);
  // No need to tell the world which server this is.
  app.disable('x-powered-by');

  // The site's own headers (Content-Security-Policy and the rest) come from
  // frontend/public/_headers; helmet's defaults would block Google Analytics,
  // Cloudinary and YouTube there. So helmet covers the API only.
  app.use('/api', helmet());

  // The site (frontend/dist), when it has been built: in production on Render.
  // Before the body parser and the session, so a file never touches the
  // database. See site/site.ts.
  const siteDir = isTest ? null : builtSiteDir();
  if (siteDir) {
    app.use(
      siteMiddleware({
        distDir: siteDir,
        routesFile: path.resolve(siteDir, '../dist-server/routes.js'),
        siteUrl: env.SITE_URL,
        apiOrigin: `http://127.0.0.1:${env.PORT}`,
        proxySecret: env.PROXY_SECRET,
      }),
    );
  }

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
        // The site shows "Entrar com Google" only when this is true.
        googleLogin: isGoogleLoginConfigured(),
      },
    });
  });

  app.use('/api', buildRouter());

  // Order matters: unmatched route first, error handler last.
  app.use(notFound);
  app.use(errorMiddleware);

  return app;
}
