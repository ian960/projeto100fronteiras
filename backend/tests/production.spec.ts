import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { agent } from './helpers/agent';
import { clientIp, proxyGuard } from '../src/shared/middlewares/proxyGuard';
import { logger } from '../src/shared/utils/logger';

// What only shows up once the API is behind Render and the Cloudflare Worker.

describe('requests the client got wrong', () => {
  it('answers malformed JSON with 400, not 500', async () => {
    const response = await agent()
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": "a@b.c",')
      .expect(400);

    expect(response.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Malformed request.' });
  });

  it('answers a body over the limit with 413', async () => {
    const response = await agent()
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(1_100_000) }))
      .expect(413);

    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('proxy guard', () => {
  const secret = 's'.repeat(40);

  function app(withSecret: string | undefined) {
    const server = express();
    server.set('trust proxy', 1);
    server.use(proxyGuard(withSecret));
    server.get('/api/health', (_req, res) => res.json({ ok: true }));
    server.get('/api/who', (req, res) => res.json({ ip: clientIp(req, withSecret) }));
    return server;
  }

  it('does nothing without PROXY_SECRET (development, Docker)', async () => {
    const response = await request(app(undefined)).get('/api/who').set('x-client-ip', '203.0.113.9').expect(200);
    // Without the secret a forged x-client-ip is ignored.
    expect(response.body.ip).not.toBe('203.0.113.9');
  });

  it('refuses requests that skip the Worker', async () => {
    await request(app(secret)).get('/api/who').expect(403);
    await request(app(secret)).get('/api/who').set('x-proxy-secret', 'wrong').expect(403);
    await request(app(secret)).get('/api/who').set('x-proxy-secret', `${secret}x`).expect(403);
  });

  it("lets Render's health check in without the secret", async () => {
    await request(app(secret)).get('/api/health').expect(200);
  });

  it("uses the Worker's x-client-ip for rate limits", async () => {
    const response = await request(app(secret))
      .get('/api/who')
      .set('x-proxy-secret', secret)
      .set('x-client-ip', '203.0.113.9')
      .expect(200);

    expect(response.body.ip).toBe('203.0.113.9');
  });
});

describe('logger', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps the message and stack of an error nested in the details', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => lines.push(line));

    logger.error('Unhandled error', { err: new TypeError('boom'), url: '/api/x' });

    const entry = JSON.parse(lines[0]!);
    expect(entry.meta.err).toMatchObject({ name: 'TypeError', message: 'boom' });
    expect(entry.meta.err.stack).toContain('boom');
    expect(entry.meta.url).toBe('/api/x');
  });
});
