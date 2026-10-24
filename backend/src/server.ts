import { env, usingDevSessionSecret } from './config/env';
import { createApp } from './app';
import { disconnectDatabase } from './config/prisma';
import { isMediaConfigured } from './config/cloudinary';
import { logger } from './shared/utils/logger';

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}`);

  // Say out loud what is running in degraded mode, so nobody spends an hour
  // wondering why an upload returns 503.
  if (!isMediaConfigured()) {
    logger.warn(
      'Cloudinary is not configured: uploads answer 503 and news cannot be published without a cover. Everything else works.',
    );
  }

  if (usingDevSessionSecret) {
    logger.warn('SESSION_SECRET is not set: using the development fallback. Never do this in production.');
  }
});

// Render's proxy keeps connections to the API open and reuses them. If Node
// closed an idle one first (its default is 5 s), a request sent on it at that
// moment would come back as a 502. Keep them open longer than the proxy does.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// A promise nobody awaited, or an exception outside a request: log it with its
// stack before the process dies, so the cause is in Render's logs.
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { err: reason });
});
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception, exiting', { err });
  process.exit(1);
});

// Finish in-flight requests and close the pool instead of dropping
// connections mid-query when the container is replaced.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    logger.info(`${signal} received, shutting down`);

    server.close(() => {
      void disconnectDatabase().finally(() => process.exit(0));
    });
  });
}
