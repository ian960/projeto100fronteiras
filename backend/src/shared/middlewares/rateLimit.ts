import rateLimit from 'express-rate-limit';
import { isTest } from '../../config/env';

// Disabled under test: the suite fires dozens of logins in a few seconds and
// would trip the limiter instead of testing what it means to test.
const skip = () => isTest;

// Brute force on a password field.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Try again later.' } },
});

// A public sign-up endpoint with no limit becomes a fake-account dump.
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Too many sign-ups from this address.' } },
});
