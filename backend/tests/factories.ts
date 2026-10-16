import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { prisma } from '../src/config/prisma';

// Shared plaintext so tests can log in without hashing a new value each time.
export const TEST_PASSWORD = 'senha12345';

let sequence = 0;

// email and slug are unique columns. Without a per-call suffix, the second
// test that builds a columnist dies on P2002.
const uniq = () => `${Date.now().toString(36)}-${(sequence += 1)}`;

export async function makeUser(overrides: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      name: 'Test Reader',
      email: `user-${uniq()}@test.local`,
      passwordHash: await argon2.hash(TEST_PASSWORD),
      role: 'reader',
      ...overrides,
    },
  });
}

export async function makeAdmin(overrides: Record<string, unknown> = {}) {
  return makeUser({ name: 'Test Admin', role: 'admin', ...overrides });
}

export async function makeWriter(overrides: Record<string, unknown> = {}) {
  return prisma.author.create({
    data: {
      name: 'Test Writer',
      slug: `writer-${uniq()}`,
      type: 'writer',
      ...overrides,
    },
  });
}

// A columnist is one user plus one author row linked to it — the same pair the
// promote endpoint creates in a transaction.
export async function makeColumnist(overrides: Record<string, unknown> = {}) {
  const user = await makeUser({ name: 'Test Columnist', role: 'columnist' });

  const author = await prisma.author.create({
    data: {
      userId: user.id,
      name: 'Test Columnist',
      slug: `columnist-${uniq()}`,
      type: 'columnist',
      columnTitle: 'Test Column',
      ...overrides,
    },
  });

  return { user, author };
}

export async function makeCategory(overrides: Record<string, unknown> = {}) {
  const suffix = uniq();

  return prisma.category.create({
    data: {
      name: `Category ${suffix}`,
      slug: `category-${suffix}`,
      ...overrides,
    },
  });
}

// A file as if it had been uploaded to Cloudinary, straight into the table.
// For tests about posts and authors, where how the file got there does not
// matter. Tests about the upload itself go through the fake Cloudinary.
export async function makeMedia(
  uploadedById: string,
  kind: 'image' | 'video' | 'document' = 'image',
  overrides: Record<string, unknown> = {},
) {
  const folder = { image: 'covers', video: 'videos', document: 'documents' }[kind];
  const format = { image: 'jpg', video: 'mp4', document: 'pdf' }[kind];

  return prisma.media.create({
    data: {
      kind,
      publicId: `portal-test/${folder}/${randomUUID()}`,
      version: '1760000000',
      format,
      bytes: 123_456,
      width: kind === 'document' ? null : 1600,
      height: kind === 'document' ? null : 900,
      durationSec: kind === 'video' ? 12.5 : null,
      pages: kind === 'document' ? 3 : null,
      originalName: `example.${format}`,
      uploadedById,
      ...overrides,
    },
  });
}

// Complete enough to be published: excerpt, content and cover all filled.
export async function makeNews(
  params: { authorId: string; createdById: string; categoryId: string },
  overrides: Record<string, unknown> = {},
) {
  const suffix = uniq();
  const cover = await makeMedia(params.createdById);

  return prisma.post.create({
    data: {
      type: 'news',
      status: 'draft',
      title: `News ${suffix}`,
      slug: `news-${suffix}`,
      excerpt: 'A short summary.',
      content: '<p>Body of the article.</p>',
      coverId: cover.id,
      coverAlt: 'Example cover',
      categoryId: params.categoryId,
      authorId: params.authorId,
      createdById: params.createdById,
      ...overrides,
    },
  });
}

export async function makeColumn(
  params: { authorId: string; createdById: string },
  overrides: Record<string, unknown> = {},
) {
  const suffix = uniq();

  return prisma.post.create({
    data: {
      type: 'column',
      status: 'draft',
      title: `Column ${suffix}`,
      slug: `column-${suffix}`,
      excerpt: 'A short opinion summary.',
      content: '<p>Body of the column.</p>',
      // categoryId stays null: the CHECK constraint refuses a column with one.
      authorId: params.authorId,
      createdById: params.createdById,
      ...overrides,
    },
  });
}
