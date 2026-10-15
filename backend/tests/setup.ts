import { afterAll, afterEach, beforeAll } from 'vitest';
import { prisma, disconnectDatabase } from '../src/config/prisma';
import { assertTestDatabase, resetTestDatabase } from './helpers/database';

beforeAll(async () => {
  const url = assertTestDatabase(process.env.DATABASE_URL);

  // Once per test file. Between individual tests, deleteMany below is enough.
  await resetTestDatabase(url);
});

afterEach(async () => {
  // Child rows before parents. Every foreign key in this schema is Restrict,
  // so deleting users before posts is refused by the database — this order is
  // literally the shape of the relations.
  await prisma.post.deleteMany();
  await prisma.author.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$executeRaw`DELETE FROM "session"`;
});

afterAll(async () => {
  await disconnectDatabase();
});
