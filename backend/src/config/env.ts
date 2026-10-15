import 'dotenv/config';
import { z } from 'zod';

// Only DATABASE_URL is mandatory to boot in development.
//
// Everything else has a safe development default, so the API can be started
// and tested (categories, auth, posts) before anyone has Cloudflare keys.
// Production is stricter: see the refinements at the bottom.

// `R2_BUCKET=` in a .env file arrives as an empty string, not as "missing".
// Treat both the same way, or an empty line would fail validation.
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.url().optional());

const DEV_SESSION_SECRET = 'development-only-session-secret-never-use-in-production';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3333),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    SESSION_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().min(32, 'SESSION_SECRET needs at least 32 characters').optional(),
    ),
    SITE_URL: z.preprocess(emptyToUndefined, z.url().default('http://localhost:5173')),

    // Cloudflare R2. Optional: without it the API runs normally and only the
    // upload endpoints answer 503.
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET: optionalString,
    R2_PUBLIC_URL: optionalUrl,

    // First admin, created by `npm run db:seed`.
    SEED_ADMIN_NAME: z.preprocess(emptyToUndefined, z.string().default('Admin')),
    SEED_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.email().default('admin@portal.local')),
    SEED_ADMIN_PASSWORD: optionalString,
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.SESSION_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'SESSION_SECRET is required in production.',
      });
    }

    // R2 is all or nothing. Four of five keys is a typo, not a choice, and
    // would otherwise surface as a confusing error on the first upload.
    const r2 = [
      value.R2_ACCOUNT_ID,
      value.R2_ACCESS_KEY_ID,
      value.R2_SECRET_ACCESS_KEY,
      value.R2_BUCKET,
      value.R2_PUBLIC_URL,
    ];
    const filled = r2.filter((item) => item !== undefined).length;

    if (filled > 0 && filled < r2.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['R2_ACCOUNT_ID'],
        message:
          'R2 is partially configured. Fill in all five R2_* variables, or leave all of them empty.',
      });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:');
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

const data = parsed.data;

export const env = {
  ...data,
  SESSION_SECRET: data.SESSION_SECRET ?? DEV_SESSION_SECRET,
};

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const usingDevSessionSecret = data.SESSION_SECRET === undefined;

export const r2Config =
  data.R2_ACCOUNT_ID &&
  data.R2_ACCESS_KEY_ID &&
  data.R2_SECRET_ACCESS_KEY &&
  data.R2_BUCKET &&
  data.R2_PUBLIC_URL
    ? {
        accountId: data.R2_ACCOUNT_ID,
        accessKeyId: data.R2_ACCESS_KEY_ID,
        secretAccessKey: data.R2_SECRET_ACCESS_KEY,
        bucket: data.R2_BUCKET,
        publicUrl: data.R2_PUBLIC_URL.replace(/\/+$/, ''),
      }
    : null;
