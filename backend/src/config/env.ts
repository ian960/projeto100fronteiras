import 'dotenv/config';
import { z } from 'zod';

// Only DATABASE_URL is mandatory to boot in development.
//
// Everything else has a safe development default, so the API can be started
// and tested (categories, auth, posts) before anyone has Cloudinary keys.
// Production is stricter: see the refinements at the bottom.

// `CLOUDINARY_URL=` in a .env file arrives as an empty string, not as "missing".
// Treat both the same way, or an empty line would fail validation.
const emptyToUndefined = (value: unknown) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());

// The exact format the Cloudinary console shows under "API Keys":
//   cloudinary://<api_key>:<api_secret>@<cloud_name>
const CLOUDINARY_URL_PATTERN = /^cloudinary:\/\/([^:\s]+):([^@\s]+)@([A-Za-z0-9_-]+)$/;

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

    // Cloudinary. Optional in development: without it the API runs normally,
    // the media endpoints answer 503, and news cannot be published (a cover
    // image is required). Mandatory in production.
    CLOUDINARY_URL: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          CLOUDINARY_URL_PATTERN,
          'CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>',
        )
        .optional(),
    ),
    // Top folder for every file this API uploads. Use a different one per
    // environment ("portal-dev", "portal") if they share one Cloudinary account.
    CLOUDINARY_FOLDER: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-z0-9][a-z0-9_-]*$/i, 'Letters, numbers, - and _ only.')
        .default('portal'),
    ),
    // Leave both empty. Only the automated tests point them at a fake
    // Cloudinary running on localhost.
    CLOUDINARY_API_BASE: z.preprocess(emptyToUndefined, z.url().default('https://api.cloudinary.com')),
    CLOUDINARY_DELIVERY_BASE: z.preprocess(
      emptyToUndefined,
      z.url().default('https://res.cloudinary.com'),
    ),

    // Shared with the Cloudflare Worker that serves the site (see
    // shared/middlewares/proxyGuard.ts). Required in production.
    PROXY_SECRET: z.preprocess(
      emptyToUndefined,
      z.string().min(32, 'PROXY_SECRET needs at least 32 characters').optional(),
    ),

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

    // Without it the API cannot tell readers apart behind the Worker, and the
    // login limit would be shared by everyone (see proxyGuard.ts).
    if (value.NODE_ENV === 'production' && !value.PROXY_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROXY_SECRET'],
        message: 'PROXY_SECRET is required in production (the same value as in the Cloudflare Worker).',
      });
    }

    // A news portal that cannot store a cover image cannot publish news.
    if (value.NODE_ENV === 'production' && !value.CLOUDINARY_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLOUDINARY_URL'],
        message: 'CLOUDINARY_URL is required in production.',
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

const cloudinaryMatch = data.CLOUDINARY_URL?.match(CLOUDINARY_URL_PATTERN);

export const cloudinaryConfig = cloudinaryMatch
  ? {
      apiKey: cloudinaryMatch[1]!,
      apiSecret: cloudinaryMatch[2]!,
      cloudName: cloudinaryMatch[3]!,
      folder: data.CLOUDINARY_FOLDER,
      apiBase: data.CLOUDINARY_API_BASE.replace(/\/+$/, ''),
      deliveryBase: data.CLOUDINARY_DELIVERY_BASE.replace(/\/+$/, ''),
    }
  : null;

export type CloudinaryConfig = NonNullable<typeof cloudinaryConfig>;
