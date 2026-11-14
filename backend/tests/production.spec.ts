import { afterEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { agent } from './helpers/agent';
import { clientIp, proxyGuard } from '../src/shared/middlewares/proxyGuard';
import { logger } from '../src/shared/utils/logger';

// What only shows up once the API is behind Render and the Cloudflare Worker.

describe('pedidos errados do cliente', () => {
  it('responde 400, não 500, a JSON malformado', async () => {
    const response = await agent()
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": "a@b.c",')
      .expect(400);

    expect(response.body.error).toEqual({ code: 'BAD_REQUEST', message: 'Malformed request.' });
  });

  it('responde 413 a corpo acima do limite', async () => {
    const response = await agent()
      .post('/api/auth/login')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.c', password: 'x'.repeat(1_100_000) }))
      .expect(413);

    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('proteção do Worker (PROXY_SECRET)', () => {
  const secret = 's'.repeat(40);

  function app(withSecret: string | undefined) {
    const server = express();
    server.set('trust proxy', 1);
    server.use(proxyGuard(withSecret));
    server.get('/api/health', (_req, res) => res.json({ ok: true }));
    server.get('/api/who', (req, res) => res.json({ ip: clientIp(req, withSecret) }));
    return server;
  }

  it('não faz nada sem PROXY_SECRET (desenvolvimento, Docker)', async () => {
    const response = await request(app(undefined)).get('/api/who').set('x-client-ip', '203.0.113.9').expect(200);
    // Without the secret a forged x-client-ip is ignored.
    expect(response.body.ip).not.toBe('203.0.113.9');
  });

  it('recusa pedidos que pulam o Worker', async () => {
    await request(app(secret)).get('/api/who').expect(403);
    await request(app(secret)).get('/api/who').set('x-proxy-secret', 'wrong').expect(403);
    await request(app(secret)).get('/api/who').set('x-proxy-secret', `${secret}x`).expect(403);
  });

  it('deixa o health check do Render entrar sem o segredo', async () => {
    await request(app(secret)).get('/api/health').expect(200);
  });

  it('usa o x-client-ip do Worker nos limites de tentativas', async () => {
    const response = await request(app(secret))
      .get('/api/who')
      .set('x-proxy-secret', secret)
      .set('x-client-ip', '203.0.113.9')
      .expect(200);

    expect(response.body.ip).toBe('203.0.113.9');
  });
});

describe('registro de logs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mantém mensagem e pilha de um erro dentro dos detalhes', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((line: string) => lines.push(line));

    logger.error('Unhandled error', { err: new TypeError('boom'), url: '/api/x' });

    const entry = JSON.parse(lines[0]!);
    expect(entry.meta.err).toMatchObject({ name: 'TypeError', message: 'boom' });
    expect(entry.meta.err.stack).toContain('boom');
    expect(entry.meta.url).toBe('/api/x');
  });
});
