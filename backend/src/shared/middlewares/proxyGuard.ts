import crypto from 'node:crypto';
import type { Request } from 'express';

// Who is asking, for the rate limits (rateLimit.ts).
//
// The site is served by this API on Render, so a visitor's request arrives
// straight from Render's proxy, and req.ip (X-Forwarded-For, trusted by
// app.ts) is the visitor.
//
// Two callers speak for someone else and add two headers:
//
//   x-proxy-secret  the PROXY_SECRET shared with them
//   x-client-ip     the visitor's address
//
// The Cloudflare Worker (frontend/worker/index.ts, the workers.dev address),
// which forwards /api/* from Cloudflare's own addresses, and this server's
// SEO pages (site/site.ts), which ask the API from 127.0.0.1. x-client-ip is
// believed only together with the right secret: anyone else could send their
// own and dodge the login limit.

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual: comparing byte by byte with === would leak, through
  // timing, how much of a guessed secret is right.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function clientIp(req: Request, secret: string | undefined): string {
  if (secret) {
    const given = req.get('x-proxy-secret');
    const forwarded = req.get('x-client-ip');
    if (given && forwarded && sameSecret(given, secret)) return forwarded;
  }
  return req.ip ?? 'unknown';
}
