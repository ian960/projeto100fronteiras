import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env, isTest } from '../../config/env';
import { clientIp } from './proxyGuard';

// Disabled under test: the suite fires dozens of logins in a few seconds and
// would trip the limiter instead of testing what it means to test.
const skip = () => isTest;

// The visitor's address, also behind the Cloudflare Worker (see proxyGuard).
const keyGenerator = (req: Request) => clientIp(req, env.PROXY_SECRET);

// Brute force on a password field. Only failed attempts count: a newsroom
// behind one office connection logs in many times a day, and that is fine.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' } },
});

// A public sign-up endpoint with no limit becomes a fake-account dump.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  keyGenerator,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many sign-ups from this address.' } },
});
