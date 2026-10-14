import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

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
  datasource: { url: env('DATABASE_URL') },
});
