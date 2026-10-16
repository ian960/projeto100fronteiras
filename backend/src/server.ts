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
