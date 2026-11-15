import { afterAll, afterEach, beforeAll } from 'vitest';
import { prisma, disconnectDatabase } from '../src/config/prisma';
import { assertTestDatabase, resetTestDatabase } from './helpers/database';

// Prisma's Postgres adapter queues the queries of a transaction on one
// connection, and pg 8 warns (once per test file) that pg 9 will refuse it.
// Harmless today, and Prisma's to change, not ours; in the test list it only
// looks like a problem. Every other warning still shows.
const emitWarning = process.emitWarning.bind(process) as (...args: unknown[]) => void;
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning.message;
  if (message.includes('client is already executing a query')) return;
  emitWarning(warning, ...rest);
}) as typeof process.emitWarning;

beforeAll(async () => {
  const url = assertTestDatabase(process.env.DATABASE_URL);

  // Once per test file. Between individual tests, deleteMany below is enough.
  await resetTestDatabase(url);
});

afterEach(async () => {
  // Child rows before parents. Every foreign key in this schema is Restrict,
  // so deleting users before posts is refused by the database — this order is
  // literally the shape of the relations.
  // Attachments go with their post (Cascade). Media after everything that
  // points at it, users last because media points at its uploader.
  await prisma.newsletterIssue.deleteMany();
  await prisma.newsletterSubscriber.deleteMany();
  await prisma.post.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.author.deleteMany();
  await prisma.media.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$executeRaw`DELETE FROM "session"`;
});

afterAll(async () => {
  await disconnectDatabase();
});
