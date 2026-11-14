import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { outbox } from '../src/shared/mail/mailer';
import { agent, loginAs } from './helpers/agent';
import { makeUser, TEST_PASSWORD } from './factories';

// "Esqueci minha senha": a link by e-mail (the "log" provider keeps it in
// memory here), valid for one hour, used once.

const linkTo = (email: string) => {
  const mail = [...outbox].reverse().find((m) => m.to.email === email && m.subject === 'Redefina sua senha');
  const token = mail?.text.match(/token=([A-Za-z0-9_-]+)/)?.[1];
  return token ?? null;
};

// The mail is sent without being awaited (see AuthService.forgotPassword).
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

async function askForLink(email: string) {
  await agent().post('/api/auth/forgot-password').send({ email }).expect(204);
  await settle();
  return linkTo(email);
}

beforeEach(() => {
  outbox.length = 0;
});

describe('pedir um link', () => {
  it('manda o link por e-mail para uma conta que existe', async () => {
    const user = await makeUser();

    const token = await askForLink(user.email);

    expect(token).toBeTruthy();
    expect(outbox[0]!.text).toContain('/redefinir-senha?token=');
    // Only the hash is stored.
    const stored = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toBe(token);
  });

  it('responde igual para um e-mail sem conta, e não manda nada', async () => {
    await agent().post('/api/auth/forgot-password').send({ email: 'ninguem@test.local' }).expect(204);
    await settle();
    expect(outbox).toHaveLength(0);
  });

  it('manda no máximo três links por hora para a mesma conta', async () => {
    const user = await makeUser();

    for (let i = 0; i < 5; i += 1) await askForLink(user.email);

    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(3);
  });

  it('não manda nada para conta desativada', async () => {
    const user = await makeUser({ active: false });
    expect(await askForLink(user.email)).toBeNull();
  });
});

describe('escolher a senha nova', () => {
  it('troca a senha, derruba todas as sessões e avisa por e-mail', async () => {
    const user = await makeUser();
    const { client: oldSession } = await loginAs(user.email);
    const token = await askForLink(user.email);

    await agent().post('/api/auth/reset-password').send({ token, newPassword: 'senha-nova-123' }).expect(204);
    await settle();

    await oldSession.get('/api/auth/me').expect(401);
    await loginAs(user.email, 'senha-nova-123');
    await agent().post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD }).expect(401);
    expect(outbox.some((m) => m.subject === 'Sua senha foi alterada')).toBe(true);
  });

  it('funciona uma vez só e invalida os outros links', async () => {
    const user = await makeUser();
    const first = await askForLink(user.email);
    const second = await askForLink(user.email);

    await agent().post('/api/auth/reset-password').send({ token: second, newPassword: 'senha-nova-123' }).expect(204);

    await agent().post('/api/auth/reset-password').send({ token: second, newPassword: 'outra-senha-123' }).expect(422);
    await agent().post('/api/auth/reset-password').send({ token: first, newPassword: 'outra-senha-123' }).expect(422);
  });

  it('recusa link vencido e link inventado', async () => {
    const user = await makeUser();
    const token = await askForLink(user.email);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const expired = await agent()
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'senha-nova-123' })
      .expect(422);
    expect(expired.body.error.fields).toHaveProperty('token');

    await agent()
      .post('/api/auth/reset-password')
      .send({ token: 'x'.repeat(43), newPassword: 'senha-nova-123' })
      .expect(422);
  });

  it('recusa senha curta', async () => {
    const user = await makeUser();
    const token = await askForLink(user.email);

    await agent().post('/api/auth/reset-password').send({ token, newPassword: '123' }).expect(422);
  });
});
