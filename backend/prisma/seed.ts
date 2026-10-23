import argon2 from 'argon2';
import { prisma, disconnectDatabase } from '../src/config/prisma';
import { env, isProduction } from '../src/config/env';

// Development fallback, printed below so whoever runs the seed knows how to
// log in. Refused in production: a known default password on a live admin
// account is how sites get taken over.
const DEV_ADMIN_PASSWORD = 'admin12345';

// Creates the first admin and the default "Redação" byline.
//
// Idempotent: running it twice changes nothing. Run with `npm run db:seed`.
async function main() {
  // Also refused when the database is not on this machine or in Docker:
  // seeding the Render database from a laptop runs with NODE_ENV unset.
  const host = new URL(env.DATABASE_URL).hostname;
  const isLocalDatabase = ['localhost', '127.0.0.1', '::1', 'db'].includes(host);

  if ((isProduction || !isLocalDatabase) && !env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      `SEED_ADMIN_PASSWORD must be set to seed ${isProduction ? 'a production' : `the database at ${host}`}.`,
    );
  }

  const email = env.SEED_ADMIN_EMAIL.toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD ?? DEV_ADMIN_PASSWORD;

  const existingAdmin = await prisma.user.findUnique({ where: { email } });

  if (existingAdmin) {
    console.log(`Admin already exists: ${email}`);
  } else {
    await prisma.user.create({
      data: {
        name: env.SEED_ADMIN_NAME,
        email,
        passwordHash: await argon2.hash(password),
        role: 'admin',
      },
    });

    console.log('Admin created.');
    console.log(`  email:    ${email}`);
    if (!env.SEED_ADMIN_PASSWORD) {
      console.log(`  password: ${DEV_ADMIN_PASSWORD}   (development default — set SEED_ADMIN_PASSWORD to change it)`);
    }
  }

  // News is signed by a byline, and the admin has no author profile of their
  // own. Without at least one writer, the first article cannot be created.
  const existingWriter = await prisma.author.findUnique({ where: { slug: 'redacao' } });

  if (!existingWriter) {
    await prisma.author.create({
      data: {
        name: 'Redação',
        slug: 'redacao',
        type: 'writer',
        bio: 'Equipe do Portal Sem Fronteiras.',
      },
    });

    console.log('Default writer created: Redação (slug: redacao)');
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => disconnectDatabase());
