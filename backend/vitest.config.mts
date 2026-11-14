import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { config, parse } from 'dotenv';
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

// Never a real e-mail from the tests, whatever backend/.env says: the "log"
// provider keeps what it would send in memory (shared/mail/mailer.ts outbox).
process.env.MAIL_PROVIDER = 'log';

// The real account, for the cloudinary-real group only: REAL_CLOUDINARY_URL,
// or the CLOUDINARY_URL in backend/.env (which the line above keeps away from
// every other group).
function realCloudinaryUrl(): string {
  if (process.env.REAL_CLOUDINARY_URL) return process.env.REAL_CLOUDINARY_URL;
  try {
    return parse(readFileSync(new URL('./.env', import.meta.url))).CLOUDINARY_URL ?? '';
  } catch {
    return '';
  }
}

// Three groups, run one after the other (groupOrder) because they share the
// test database:
//   api                 everything, against a fake Cloudinary on localhost
//   sem-cloudinary      proves the API still works with no Cloudinary keys
//   cloudinary-real     the same path against the real Cloudinary; only with
//                       `npm run test:cloudinary`, never in `npm test`
export default defineConfig({
  test: {
    // Every test on its own line, grouped by file and by what it checks:
    //   ✓ |api| tests/auth.spec.ts (12 tests)
    //     ✓ login (3)
    //       ✓ gives the same error for a wrong password and an unknown email
    // A failure shows up as ✗ in place, with the details at the end.
    // (package.json runs vitest with --configLoader runner: the default loader
    // prints a warning about a future Vite change at every run.)
    reporters: ['tree'],
    // Some tests break a rule on purpose (a CHECK constraint, a link that
    // leads nowhere) to prove it is refused. Prisma and the logger report
    // those as errors, which would cut the list in the middle and look like a
    // failure. Hidden here; a test that really fails still shows why.
    // TEST_LOGS=1 shows everything, for when you are chasing a problem.
    onConsoleLog(log) {
      if (process.env.TEST_LOGS) return;
      if (log.includes('prisma:error') || /"level":"(warn|error)"/.test(log)) return false;
    },
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
          exclude: ['tests/runtime.spec.ts', 'tests/cloudinary-real.spec.ts'],
          env: FAKE_CLOUDINARY_ENV,
          globalSetup: ['./tests/helpers/fakeCloudinary.global.ts'],
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: 'sem-cloudinary',
          include: ['tests/runtime.spec.ts'],
          env: { CLOUDINARY_URL: '' },
          sequence: { groupOrder: 1 },
        },
      },
      {
        extends: true,
        test: {
          name: 'cloudinary-real',
          include: ['tests/cloudinary-real.spec.ts'],
          // Its own folder, so a test file never mixes with the portal's.
          env: { CLOUDINARY_URL: realCloudinaryUrl(), CLOUDINARY_FOLDER: 'portal-testes' },
          // Uploads over the internet, and a video prepared in the background.
          testTimeout: 180_000,
          sequence: { groupOrder: 2 },
        },
      },
    ],
  },
});
