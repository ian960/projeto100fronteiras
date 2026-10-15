import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { env, isTest } from './env';

// One pool for the whole process. The session store reuses it, so there is a
// single place where connection limits are configured.
export const pool = new Pool({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

// Tests need the pool closed or vitest hangs on an open handle.
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  if (!isTest) return;
  await pool.end();
}
