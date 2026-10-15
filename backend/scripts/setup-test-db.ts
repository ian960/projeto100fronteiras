// npm run db:test:setup
//
// 1. Creates backend/.env.test from backend/.env if it does not exist yet,
//    pointing at "<your database>_test" on the same server and port.
// 2. Creates that database if it does not exist.
//
// Safe to run any number of times. It never touches the development database
// and never runs migrations — the test suite rebuilds the schema itself.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { Client } from 'pg';

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const envTestPath = path.join(root, '.env.test');

function fail(message: string): never {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function ensureEnvTest(): void {
  if (fs.existsSync(envTestPath)) {
    console.log('.env.test already exists — keeping it.');
    return;
  }

  if (!fs.existsSync(envPath)) {
    fail('backend/.env not found. Create it from .env.example first.');
  }

  const devUrl = dotenv.parse(fs.readFileSync(envPath)).DATABASE_URL;
  if (!devUrl) fail('DATABASE_URL is missing from backend/.env.');

  const url = new URL(devUrl);
  const devName = url.pathname.replace(/^\//, '');
  url.pathname = `/${devName}_test`;

  const lines = [
    '# Created by `npm run db:test:setup`. Ignored by git.',
    'NODE_ENV=test',
    `DATABASE_URL="${url.toString()}"`,
    `SESSION_SECRET=${crypto.randomBytes(32).toString('hex')}`,
    'SITE_URL=http://localhost:5173',
    '',
  ];

  fs.writeFileSync(envTestPath, lines.join('\n'));
  console.log(`Created .env.test → database "${devName}_test" on ${url.host}`);
}

async function ensureDatabase(): Promise<void> {
  const testUrl = dotenv.parse(fs.readFileSync(envTestPath)).DATABASE_URL;
  if (!testUrl) fail('DATABASE_URL is missing from backend/.env.test.');

  const url = new URL(testUrl);
  const name = url.pathname.replace(/^\//, '');

  if (!name.endsWith('_test')) {
    fail(`The test database must end in _test (got "${name}"). Fix backend/.env.test.`);
  }

  // CREATE DATABASE cannot take a bind parameter, so the name is validated
  // before it is interpolated.
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    fail(`Unsupported database name "${name}". Use letters, digits and underscores only.`);
  }

  // Connect to the server's maintenance database, not to the one we are
  // about to create.
  url.pathname = '/postgres';
  url.search = '';

  const client = new Client({ connectionString: url.toString() });

  try {
    await client.connect();
  } catch (err) {
    fail(
      `Could not reach Postgres at ${url.host}: ${(err as Error).message}\n` +
        '  Is the container up? Run `docker compose up -d` from the repository root.',
    );
  }

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);

    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`Database "${name}" already exists.`);
    } else {
      await client.query(`CREATE DATABASE "${name}"`);
      console.log(`Database "${name}" created.`);
    }
  } finally {
    await client.end();
  }
}

async function main() {
  ensureEnvTest();
  await ensureDatabase();
  console.log('Ready. Run: npm test');
}

void main();
