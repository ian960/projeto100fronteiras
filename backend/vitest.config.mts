import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

// Loaded before anything else, so src/config/env.ts sees the test database.
// If .env.test is missing, tests/setup.ts refuses to run instead of falling
// back to the development database.
config({ path: '.env.test', quiet: true });

// Keep the suite deterministic: R2 is only on if .env.test turns it on.
// Pre-setting the keys to "" stops dotenv (inside src/config/env.ts) from
// pulling real Cloudflare credentials out of backend/.env.
for (const key of [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET',
  'R2_PUBLIC_URL',
]) {
  process.env[key] ??= '';
}

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    // Integration tests share one database. Running files in parallel would
    // make them wipe each other's rows.
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
