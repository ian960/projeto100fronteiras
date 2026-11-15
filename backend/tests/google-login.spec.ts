import { afterEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeUser, TEST_PASSWORD } from './factories';

// "Entrar com Google" without Google: the tests play Google's part. They
// follow the browser to /api/auth/google, read the state and nonce from the
// address it would open, and answer the API's code exchange themselves.

const CLIENT_ID = 'test-client.apps.googleusercontent.com';
const realFetch = globalThis.fetch;

type Claims = Record<string, unknown>;

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function idToken(claims: Claims) {
  return `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(claims)}.c2lnbmF0dXJl`;
}

// Google's token endpoint answers with this ID token. Everything else goes
// through (the fake Cloudinary, for one).
function googleAnswers(claims: (nonce: string) => Claims, nonce: string) {
  const spy = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === 'https://oauth2.googleapis.com/token') {
      return Response.json({ access_token: 'x', id_token: idToken(claims(nonce)) });
    }
    return realFetch(input, init);
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

const profile = (overrides: Claims = {}) => (nonce: string): Claims => ({
  iss: 'https://accounts.google.com',
  aud: CLIENT_ID,
  exp: Math.floor(Date.now() / 1000) + 3600,
  sub: 'google-sub-1',
  email: 'leitora@gmail.com',
  email_verified: true,
  name: 'Leitora Google',
  nonce,
  ...overrides,
});

// The whole round trip. Returns where the reader ends up.
async function signInWithGoogle(
  claims: (nonce: string) => Claims,
  { client = agent(), next }: { client?: ReturnType<typeof agent>; next?: string } = {},
) {
  const start = await client
    .get('/api/auth/google')
    .query(next ? { proxima: next } : {})
    .expect(302);

  const google = new URL(start.headers.location as string);
  expect(google.origin).toBe('https://accounts.google.com');
  const state = google.searchParams.get('state')!;
  const nonce = google.searchParams.get('nonce')!;

  const exchange = googleAnswers(claims, nonce);

  const back = await client
    .get('/api/auth/google/callback')
    .query({ code: 'a-code-from-google', state })
    .expect(302);

  return { client, location: back.headers.location as string, exchange, google };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('entrar com Google', () => {
  it('manda para o Google com state, nonce e PKCE', async () => {
    const response = await agent().get('/api/auth/google').expect(302);
    const url = new URL(response.headers.location as string);

    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/google/callback');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')?.length).toBeGreaterThan(30);
    expect(url.searchParams.get('nonce')?.length).toBeGreaterThan(30);
  });

  it('cria um leitor sem senha na primeira vez', async () => {
    const { client, location } = await signInWithGoogle(profile({ role: 'admin' }), { next: '/noticia/uma' });

    // First time: creating a password comes before anything else.
    expect(location).toBe('/criar-senha?proxima=%2Fnoticia%2Fuma');

    const me = await client.get('/api/auth/me').expect(200);
    expect(me.body.data.user).toMatchObject({
      email: 'leitora@gmail.com',
      name: 'Leitora Google',
      role: 'reader',
      hasPassword: false,
      googleLinked: true,
    });
    expect(me.body.data.user).not.toHaveProperty('passwordHash');
    expect(me.body.data.user).not.toHaveProperty('googleId');
  });

  it('na segunda vez entra na mesma conta, mesmo se o e-mail do Google mudou', async () => {
    await signInWithGoogle(profile());
    const { client } = await signInWithGoogle(profile({ email: 'novo-endereco@gmail.com' }));

    const me = await client.get('/api/auth/me').expect(200);
    expect(me.body.data.user.email).toBe('leitora@gmail.com');
    expect(await prisma.user.count()).toBe(1);
  });

  it('liga o Google a uma conta que já existe com o mesmo e-mail, e a senha continua valendo', async () => {
    const user = await makeUser({ email: 'leitora@gmail.com' });

    const { client } = await signInWithGoogle(profile());
    const me = await client.get('/api/auth/me').expect(200);

    expect(me.body.data.user).toMatchObject({ id: user.id, hasPassword: true, googleLinked: true });
    await loginAs(user.email, TEST_PASSWORD);
  });

  it('não liga a conta se o Google não confirmou o e-mail', async () => {
    const user = await makeUser({ email: 'leitora@gmail.com' });

    const { client, location } = await signInWithGoogle(profile({ email_verified: false }));

    expect(location).toBe('/entrar?erro=google');
    await client.get('/api/auth/me').expect(401);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.googleId).toBeNull();
  });

  it('não liga uma conta que já tem outro Google', async () => {
    await makeUser({ email: 'leitora@gmail.com', googleId: 'outro-google' });

    const { client, location } = await signInWithGoogle(profile());

    expect(location).toBe('/entrar?erro=google-outra-conta');
    await client.get('/api/auth/me').expect(401);
  });

  it('recusa um token de outro app, vencido ou com outro nonce', async () => {
    for (const bad of [{ aud: 'other-app' }, { exp: 1000 }, { nonce: 'not-this-login' }, { iss: 'https://evil.example' }]) {
      const { client, location } = await signInWithGoogle(profile(bad));
      expect(location).toBe('/entrar?erro=google');
      await client.get('/api/auth/me').expect(401);
    }
    expect(await prisma.user.count()).toBe(0);
  });

  it('recusa um state que não é o desta sessão, sem falar com o Google', async () => {
    const client = agent();
    await client.get('/api/auth/google').expect(302);
    const exchange = googleAnswers(profile(), 'whatever');

    const response = await client
      .get('/api/auth/google/callback')
      .query({ code: 'a-code', state: 'forged-state-forged-state-forged-state' })
      .expect(302);

    expect(response.headers.location).toBe('/entrar?erro=google');
    expect(exchange).not.toHaveBeenCalled();
  });

  it('o mesmo retorno do Google não serve duas vezes', async () => {
    const client = agent();
    const start = await client.get('/api/auth/google').expect(302);
    const google = new URL(start.headers.location as string);
    const state = google.searchParams.get('state')!;
    googleAnswers(profile(), google.searchParams.get('nonce')!);

    await client.get('/api/auth/google/callback').query({ code: 'c', state }).expect(302);
    await client.post('/api/auth/logout').expect(204);

    const again = await client.get('/api/auth/google/callback').query({ code: 'c', state }).expect(302);
    expect(again.headers.location).toBe('/entrar?erro=google');
  });

  it('ignora destino de fora do site', async () => {
    await makeUser({ email: 'leitora@gmail.com' });
    const { location } = await signInWithGoogle(profile(), { next: '//evil.example/x' });
    expect(location).toBe('/');
  });

  it('manda admin e colunista para o painel', async () => {
    await makeAdmin({ email: 'leitora@gmail.com' });
    const { location } = await signInWithGoogle(profile());
    expect(location).toBe('/painel');
  });

  it('recusa conta desativada', async () => {
    await makeUser({ email: 'leitora@gmail.com', active: false });
    const { client, location } = await signInWithGoogle(profile());

    expect(location).toBe('/entrar?erro=google-desativada');
    await client.get('/api/auth/me').expect(401);
  });

  it('volta para o login sem erro quando a pessoa cancela no Google', async () => {
    const client = agent();
    await client.get('/api/auth/google').expect(302);
    const response = await client.get('/api/auth/google/callback').query({ error: 'access_denied' }).expect(302);
    expect(response.headers.location).toBe('/entrar');
  });

  it('diz ao site que o login com Google está ligado', async () => {
    const response = await agent().get('/api/health').expect(200);
    expect(response.body.data.googleLogin).toBe(true);
  });
});

describe('conta sem senha (criada com Google)', () => {
  it('não usa a conta antes de criar a senha', async () => {
    const { client } = await signInWithGoogle(profile());

    const blocked = await client.patch('/api/auth/me').send({ name: 'Outro Nome' }).expect(403);
    expect(blocked.body.error.code).toBe('PASSWORD_REQUIRED');

    // Every time, until there is one.
    const { location } = await signInWithGoogle(profile(), { client, next: '/minha-conta' });
    expect(location).toBe('/criar-senha?proxima=%2Fminha-conta');

    await client.post('/api/auth/change-password').send({ newPassword: 'minha-senha-nova' }).expect(204);
    await client.patch('/api/auth/me').send({ name: 'Outro Nome' }).expect(200);

    const after = await signInWithGoogle(profile(), { next: '/minha-conta' });
    expect(after.location).toBe('/minha-conta');
  });

  it('não entra com senha nenhuma', async () => {
    await signInWithGoogle(profile());
    await agent().post('/api/auth/login').send({ email: 'leitora@gmail.com', password: 'qualquer-coisa' }).expect(401);
  });

  it('cria uma senha sem pedir a atual, e depois entra com ela', async () => {
    const { client } = await signInWithGoogle(profile());

    await client.post('/api/auth/change-password').send({ newPassword: 'minha-senha-nova' }).expect(204);

    const me = await client.get('/api/auth/me').expect(200);
    expect(me.body.data.user.hasPassword).toBe(true);
    await loginAs('leitora@gmail.com', 'minha-senha-nova');

    // From now on the current password is required, as for everyone.
    await client.post('/api/auth/change-password').send({ newPassword: 'outra-senha-nova' }).expect(422);
  });

  it('pode receber o link de "Esqueci minha senha"', async () => {
    await signInWithGoogle(profile());
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'leitora@gmail.com' } });

    await agent().post('/api/auth/forgot-password').send({ email: 'leitora@gmail.com' }).expect(204);

    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(1);
  });

  it('exclui a própria conta sem senha', async () => {
    const { client } = await signInWithGoogle(profile());

    await client.delete('/api/auth/me').send({}).expect(204);

    expect(await prisma.user.count()).toBe(0);
    await client.get('/api/auth/me').expect(401);
  });

  it('quem tem senha continua precisando dela para excluir a conta', async () => {
    const user = await makeUser();
    const { client } = await loginAs(user.email);

    const response = await client.delete('/api/auth/me').send({}).expect(422);
    expect(response.body.error.fields).toHaveProperty('password');
    expect(await prisma.user.count()).toBe(1);
  });
});
