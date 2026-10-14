import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeUser, TEST_PASSWORD } from './factories';

describe('registration', () => {
  it('always creates a reader, whatever role is sent', async () => {
    const client = agent();

    const response = await client
      .post('/api/auth/register')
      .send({
        name: 'Someone New',
        email: 'someone@test.local',
        password: 'a-good-password',
        // The classic privilege-escalation attempt. The Zod schema has no
        // `role` key, so it never reaches the database.
        role: 'admin',
      })
      .expect(201);

    expect(response.body.data.user.role).toBe('reader');

    const stored = await prisma.user.findUnique({ where: { email: 'someone@test.local' } });
    expect(stored?.role).toBe('reader');
  });

  it('rejects a duplicate email', async () => {
    const user = await makeUser();
    const client = agent();

    const response = await client
      .post('/api/auth/register')
      .send({ name: 'Copy', email: user.email, password: 'a-good-password' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('rejects a short password', async () => {
    const client = agent();

    const response = await client
      .post('/api/auth/register')
      .send({ name: 'Someone', email: 'short@test.local', password: '123' })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.fields).toHaveProperty('body.password');
  });
});

describe('login', () => {
  it('gives the same error for a wrong password and an unknown email', async () => {
    const user = await makeUser();
    const client = agent();

    const wrongPassword = await client
      .post('/api/auth/login')
      .send({ email: user.email, password: 'not-the-password' })
      .expect(401);

    const unknownEmail = await client
      .post('/api/auth/login')
      .send({ email: 'nobody@test.local', password: 'not-the-password' })
      .expect(401);

    // Different messages would turn the login form into an account
    // enumerator: an attacker could learn which emails are registered.
    expect(wrongPassword.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('refuses a deactivated account', async () => {
    const user = await makeUser({ active: false });
    const client = agent();

    await client
      .post('/api/auth/login')
      .send({ email: user.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('returns the session user on /me', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const response = await client.get('/api/auth/me').expect(200);

    expect(response.body.data.user.email).toBe(admin.email);
    expect(response.body.data.user.role).toBe('admin');
    // Omit<IUser, 'passwordHash'> is doing its job.
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });
});

describe('session lifecycle', () => {
  it('drops access after logout', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client.get('/api/admin/posts').expect(200);
    await client.post('/api/auth/logout').expect(204);
    await client.get('/api/admin/posts').expect(401);
  });

  it('invalidates a live session when the admin resets the password', async () => {
    const admin = await makeAdmin();
    const columnist = await makeUser({ role: 'columnist' });

    const { client: victim } = await loginAs(columnist.email);
    await victim.get('/api/auth/me').expect(200);

    const { client: adminClient } = await loginAs(admin.email);

    await adminClient
      .post(`/api/admin/users/${columnist.id}/reset-password`)
      .send({ newPassword: 'a-brand-new-password' })
      .expect(204);

    // This is the whole reason sessions live in Postgres instead of a JWT:
    // the existing session dies immediately, not whenever a token expires.
    await victim.get('/api/auth/me').expect(401);
  });

  it('invalidates the session when the user is deactivated', async () => {
    const admin = await makeAdmin();
    const columnist = await makeUser({ role: 'columnist' });

    const { client: victim } = await loginAs(columnist.email);
    const { client: adminClient } = await loginAs(admin.email);

    await adminClient
      .patch(`/api/admin/users/${columnist.id}`)
      .send({ active: false })
      .expect(200);

    await victim.get('/api/auth/me').expect(401);
  });

  it('stops an admin from locking themselves out', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client.patch(`/api/admin/users/${admin.id}`).send({ active: false }).expect(403);
    await client.patch(`/api/admin/users/${admin.id}`).send({ role: 'reader' }).expect(403);
  });
});

describe('promotion to columnist', () => {
  it('creates the byline and flips the role together', async () => {
    const admin = await makeAdmin();
    const reader = await makeUser();

    const { client } = await loginAs(admin.email);

    const response = await client
      .post(`/api/admin/users/${reader.id}/promote`)
      .send({ name: 'Joana Silva', columnTitle: 'Política em Foco' })
      .expect(200);

    expect(response.body.data.user.role).toBe('columnist');
    expect(response.body.data.user.author.slug).toBe('joana-silva');

    // The promoted user can now reach the columnist panel.
    const { client: promoted } = await loginAs(reader.email);
    await promoted.get('/api/columnist/posts').expect(200);
  });

  it('refuses to promote the same user twice', async () => {
    const admin = await makeAdmin();
    const reader = await makeUser();

    const { client } = await loginAs(admin.email);

    await client
      .post(`/api/admin/users/${reader.id}/promote`)
      .send({ name: 'Joana Silva' })
      .expect(200);

    await client
      .post(`/api/admin/users/${reader.id}/promote`)
      .send({ name: 'Joana Silva' })
      .expect(409);
  });
});
