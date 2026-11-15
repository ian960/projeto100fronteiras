import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { googleConfig } from '../../config/env';
import { logger } from '../../shared/utils/logger';

// "Entrar com Google", server side (OAuth 2.0 authorization code + PKCE).
//
//   1. GET /api/auth/google        this API sends the browser to Google, with
//                                  a random state, nonce and PKCE challenge
//                                  saved in the session.
//   2. Google asks the reader which account, then sends the browser back to
//      GET /api/auth/google/callback?code=...&state=...
//   3. This API trades the code for an ID token, straight with Google (the
//      client secret never leaves the server), checks it, and logs the reader
//      in with the usual session cookie.
//
// Everything happens on the site's own address (the Worker forwards /api/*),
// so the session cookie is first-party and the same as for e-mail/password.
// No Google script runs on the site.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

// The reader has this long to pick an account on Google's page.
export const GOOGLE_LOGIN_TTL_MS = 10 * 60 * 1000;

export type GoogleProfile = {
  sub: string;
  email: string;
  name: string;
};

const random = () => randomBytes(32).toString('base64url');

export function isGoogleLoginConfigured(): boolean {
  return googleConfig !== null;
}

export function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// Step 1: what to keep in the session, and where to send the browser.
export function startGoogleLogin(next: string | null) {
  if (!googleConfig) throw new Error('Google login is not configured.');

  const pending = { state: random(), nonce: random(), verifier: random(), next, startedAt: Date.now() };
  const challenge = createHash('sha256').update(pending.verifier).digest('base64url');

  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: googleConfig.clientId,
    redirect_uri: googleConfig.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    // Always show the account picker: on a shared computer, the wrong Google
    // account must not be used silently.
    prompt: 'select_account',
  }).toString();

  return { pending, url: url.toString() };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Steps 2 and 3. Returns null for anything wrong: the controller sends the
// reader back to the login page with a message, whatever the reason.
//
// The ID token's signature is not checked here, on purpose: it comes straight
// from Google's token endpoint over HTTPS, in answer to our own request
// authenticated with the client secret. OpenID Connect allows TLS to stand in
// for the signature in that case (Core 1.0, section 3.1.3.7). Every claim
// that matters is still checked: who issued it, for which app, when it
// expires, the nonce of this login, and that Google verified the e-mail.
export async function finishGoogleLogin(
  code: string,
  verifier: string,
  nonce: string,
): Promise<GoogleProfile | null> {
  if (!googleConfig) return null;

  let body: { id_token?: unknown };
  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: googleConfig.clientId,
        client_secret: googleConfig.clientSecret,
        redirect_uri: googleConfig.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      logger.warn('Google token exchange refused', { status: response.status, body: await response.text() });
      return null;
    }
    body = (await response.json()) as { id_token?: unknown };
  } catch (err) {
    logger.error('Google token exchange failed', err);
    return null;
  }

  if (typeof body.id_token !== 'string') return null;
  const claims = decodeJwtPayload(body.id_token);
  if (!claims) return null;

  const now = Math.floor(Date.now() / 1000);
  const valid =
    typeof claims.iss === 'string' &&
    ISSUERS.has(claims.iss) &&
    claims.aud === googleConfig.clientId &&
    typeof claims.exp === 'number' &&
    claims.exp > now &&
    typeof claims.nonce === 'string' &&
    sameString(claims.nonce, nonce) &&
    typeof claims.sub === 'string' &&
    claims.sub.length > 0 &&
    typeof claims.email === 'string' &&
    // Without this, anyone could create a Google account with someone else's
    // address (not Gmail) and walk into that person's account here.
    claims.email_verified === true;

  if (!valid) {
    logger.warn('Google ID token rejected', { iss: claims.iss, aud: claims.aud, verified: claims.email_verified });
    return null;
  }

  const email = (claims.email as string).trim().toLowerCase();
  const name = typeof claims.name === 'string' ? claims.name.trim() : '';

  return { sub: claims.sub as string, email, name };
}
