import crypto from 'node:crypto';
import type { Request, RequestHandler } from 'express';

// In production the site's Cloudflare Worker (frontend/worker/index.ts) is
// the only way in. It forwards /api/* here and adds two headers:
//
//   x-proxy-secret  the PROXY_SECRET shared by the Worker and this API
//   x-client-ip     the visitor's address, as Cloudflare saw it
//
// Without PROXY_SECRET (development, Docker, tests) nothing here applies.

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual: comparing byte by byte with === would leak, through
  // timing, how much of a guessed secret is right.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Refuses requests that did not come through the Worker. Someone calling the
// Render address directly could otherwise send their own x-client-ip and dodge
// the login rate limit. Render's health check has no secret, so it is let in.
export function proxyGuard(secret: string | undefined): RequestHandler {
  return (req, res, next) => {
    if (!secret || req.path === '/api/health') return next();

    const given = req.get('x-proxy-secret');
    if (given && sameSecret(given, secret)) return next();

    res.status(403).json({
      error: { code: 'FORBIDDEN', message: 'Use the site address, not the API address.' },
    });
  };
}

// Who is asking, for the rate limits. Behind the Worker every request arrives
// from a Cloudflare address, so req.ip would put every reader in one bucket
// and ten logins would lock the whole newsroom out. With the secret set,
// proxyGuard has already checked that the request came from the Worker, so
// its x-client-ip can be trusted.
export function clientIp(req: Request, secret: string | undefined): string {
  if (secret) {
    const forwarded = req.get('x-client-ip');
    if (forwarded) return forwarded;
  }
  return req.ip ?? 'unknown';
}
