import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { FAKE_CLOUDINARY_ENV } from './tests/helpers/cloudinaryTestEnv';

// Loaded before anything else, so src/config/env.ts sees the test database.
// If .env.test is missing, tests/setup.ts refuses to run instead of falling
// back to the development database.
config({ path: '.env.test', quiet: true });

// Inside Docker the database is "db:5432", not the localhost address written
// in .env.test. docker-compose.yml passes the test database's address here.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Keep the suite deterministic: the real Cloudinary is never used here.
// Pre-setting the keys stops dotenv (inside src/config/env.ts) from pulling
// real credentials out of backend/.env; each group below sets its own.
for (const key of Object.keys(FAKE_CLOUDINARY_ENV)) {
  process.env[key] ??= '';
}

// Two groups, run one after the other (groupOrder) because they share the
// test database:
//   api                 everything, against a fake Cloudinary on localhost
//   without-cloudinary  proves the API still works with no Cloudinary keys
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
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          include: ['tests/**/*.spec.ts'],
          exclude: ['tests/runtime.spec.ts'],
          env: FAKE_CLOUDINARY_ENV,
          globalSetup: ['./tests/helpers/fakeCloudinary.global.ts'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'without-cloudinary',
          include: ['tests/runtime.spec.ts'],
          env: { CLOUDINARY_URL: '' },
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
});
