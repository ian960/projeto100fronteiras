import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Used by the Prisma CLI only (migrate, studio, db seed). The running API
// connects through the pg driver adapter in src/config/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Prisma 7 no longer seeds automatically on `migrate dev` or
    // `migrate reset`. Run it explicitly: npm run db:seed
    seed: 'tsx prisma/seed.ts',
  },
  // process.env rather than Prisma's env(): `prisma generate`, part of
  // `npm run build`, needs no database, and env() refuses to run without
  // DATABASE_URL. Migrate and seed do need it, and say so when it is missing.
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
