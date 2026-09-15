import { prisma } from '../src/config/prisma'
import argon2 from 'argon2'

let seq = 0
const uniq = () => `${Date.now()}-${seq++}`

export async function makeUser(overrides = {}) {
  return prisma.user.create({
    data: {
      name: 'Test User',
      email: `user-${uniq()}@test.local`,
      passwordHash: await argon2.hash('senha12345'),
      role: 'reader',
      ...overrides,
    },
  })
}

export async function makeColumnist(overrides = {}) {
  const user = await makeUser({ role: 'columnist' })
  const author = await prisma.author.create({
    data: {
      userId: user.id,
      name: 'Test Columnist',
      slug: `columnist-${uniq()}`,
      type: 'columnist',
      ...overrides,
    },
  })
  return { user, author }
}

export async function makeColumn(authorId: string, createdById: string, overrides = {}) {
  return prisma.post.create({
    data: {
      type: 'column',
      status: 'draft',
      title: 'Test Column',
      slug: `column-${uniq()}`,
      authorId,
      createdById,
      ...overrides,
    },
  })
}