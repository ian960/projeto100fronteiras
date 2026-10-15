import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../prisma/migrations');

// Refuses anything that does not look like a test database.
//
// The reset below drops every table. Pointed at the development database once,
// it wipes the categories and posts you created by hand to look at the site.
export function assertTestDatabase(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL is not set. Run `npm run db:test:setup` first.');
  }

  const name = new URL(url).pathname.replace(/^\//, '');

  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${name}": the database name must end in _test. ` +
        'Check backend/.env.test, or create it with `npm run db:test:setup`.',
    );
  }

  return url;
}

// Rebuilds the schema from scratch by replaying every migration in order.
//
// This is what `prisma migrate reset` does, minus the CLI: no child process,
// no migration engine binary, and it runs in well under a second. Because it
// replays the real migration files, the hand-written SQL (the CHECK
// constraints and the partial unique index) is part of what gets tested.
export async function resetTestDatabase(url: string): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');

    const migrations = fs
      .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of migrations) {
      const file = path.join(MIGRATIONS_DIR, name, 'migration.sql');
      if (!fs.existsSync(file)) continue;

      try {
        await client.query(fs.readFileSync(file, 'utf8'));
      } catch (err) {
        throw new Error(`Migration ${name} failed on the test database: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
}
