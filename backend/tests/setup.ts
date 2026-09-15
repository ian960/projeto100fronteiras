import { beforeAll, afterEach, afterAll } from 'vitest'
import { execSync } from 'node:child_process'
import { prisma } from '../src/config/prisma'

beforeAll(() => {
  // recria o schema do zero no banco de teste
  execSync('npx prisma migrate reset --force', {
    env: { ...process.env },
    stdio: 'inherit',
  })
})

afterEach(async () => {
  // ordem importa: filho antes de pai, por causa das FKs
  await prisma.post.deleteMany()
  await prisma.author.deleteMany()
  await prisma.category.deleteMany()
  await prisma.user.deleteMany()
})

afterAll(async () => {
  await prisma.$disconnect()
})