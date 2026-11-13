import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { pngFile, uploadMedia } from './helpers/upload';
import { makeAdmin, makeColumn, makeColumnist, makeMedia, makeUser, TEST_PASSWORD } from './factories';

// "Minha conta": every logged-in user edits their own name, bio and photo
// through PATCH /api/auth/me, and may delete the account (DELETE /api/auth/me).
// The admin deletes others through DELETE /api/admin/users/:id.

async function asReader() {
  const reader = await makeUser();
  const { client } = await loginAs(reader.email);
  return { reader, client };
}

describe('own account', () => {
  it('lets a reader change their name and bio', async () => {
    const { reader, client } = await asReader();

    const response = await client
      .patch('/api/auth/me')
      .send({ name: 'Novo Nome', bio: 'Leitor desde 2020.' })
      .expect(200);

    expect(response.body.data.user).toMatchObject({ name: 'Novo Nome', bio: 'Leitor desde 2020.' });

    const me = await client.get('/api/auth/me').expect(200);
    expect(me.body.data.user).toMatchObject({ name: 'Novo Nome', bio: 'Leitor desde 2020.', avatarUrl: null });

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: reader.id } });
    expect(stored.name).toBe('Novo Nome');
  });

  it('never lets anyone change their own role or email this way', async () => {
    const { reader, client } = await asReader();

    await client
      .patch('/api/auth/me')
      .send({ name: 'Tentativa', role: 'admin', email: 'outro@test.local' })
      .expect(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: reader.id } });
    expect(stored.role).toBe('reader');
    expect(stored.email).toBe(reader.email);
  });

  it('clears the bio when it is sent empty', async () => {
    const { client } = await asReader();

    await client.patch('/api/auth/me').send({ bio: 'Algo' }).expect(200);
    const response = await client.patch('/api/auth/me').send({ bio: '   ' }).expect(200);

    expect(response.body.data.user.bio).toBeNull();
  });

  it('refuses an empty change and a visitor', async () => {
    const { client } = await asReader();

    const empty = await client.patch('/api/auth/me').send({}).expect(422);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    await agent().patch('/api/auth/me').send({ name: 'Ninguém' }).expect(401);
  });

  it('lets a reader upload an account photo and use it', async () => {
    const { client } = await asReader();

    const media = await uploadMedia(client, 'avatar', pngFile(400, 400));
    const response = await client.patch('/api/auth/me').send({ avatarId: media.id }).expect(200);

    expect(response.body.data.user.avatarId).toBe(media.id);
    expect(response.body.data.user.avatarUrl).toMatch(/c_thumb,g_face,w_256,h_256/);

    const removed = await client.patch('/api/auth/me').send({ avatarId: null }).expect(200);
    expect(removed.body.data.user.avatarUrl).toBeNull();
  });

  it('keeps readers to the account photo when uploading', async () => {
    const { client } = await asReader();

    await client.post('/api/media/signature').send({ purpose: 'avatar' }).expect(200);
    await client.post('/api/media/signature').send({ purpose: 'cover' }).expect(403);
    await client.post('/api/media/signature').send({ purpose: 'video' }).expect(403);
    await client
      .post('/api/media/import')
      .send({ purpose: 'author', url: 'https://example.com/foto.jpg' })
      .expect(403);
  });

  it("refuses someone else's picture as a photo", async () => {
    const { client } = await asReader();
    const other = await makeUser();
    const theirs = await makeMedia(other.id, 'image');

    await client.patch('/api/auth/me').send({ avatarId: theirs.id }).expect(403);
  });

  it('refuses a file that is not an image', async () => {
    const { reader, client } = await asReader();
    const pdf = await makeMedia(reader.id, 'document');

    const response = await client.patch('/api/auth/me').send({ avatarId: pdf.id }).expect(422);
    expect(response.body.error.fields).toHaveProperty('avatarId');
  });
});

describe('deleting an account', () => {
  it('lets a reader delete their own account, photo included', async () => {
    const { reader, client } = await asReader();
    const media = await uploadMedia(client, 'avatar', pngFile(400, 400));
    await client.patch('/api/auth/me').send({ avatarId: media.id }).expect(200);

    await client.delete('/api/auth/me').send({ password: TEST_PASSWORD }).expect(204);

    expect(await prisma.user.findUnique({ where: { id: reader.id } })).toBeNull();
    expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
    // The session went with it.
    await client.get('/api/auth/me').expect(401);
  });

  it('asks for the password first', async () => {
    const { reader, client } = await asReader();

    const response = await client.delete('/api/auth/me').send({ password: 'not-the-password' }).expect(422);

    expect(response.body.error.fields).toHaveProperty('password');
    expect(await prisma.user.findUnique({ where: { id: reader.id } })).not.toBeNull();
  });

  it('keeps the posts of a columnist and wipes the person', async () => {
    const columnist = await makeColumnist();
    const column = await makeColumn({ authorId: columnist.author.id, createdById: columnist.user.id });
    const { client } = await loginAs(columnist.user.email);

    await client.delete('/api/auth/me').send({ password: TEST_PASSWORD }).expect(204);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: columnist.user.id } });
    expect(stored).toMatchObject({ name: 'Conta excluída', active: false, role: 'reader', bio: null, avatarId: null });
    expect(stored.email).not.toBe(columnist.user.email);
    expect(await prisma.post.findUnique({ where: { id: column.id } })).not.toBeNull();

    // Nobody can log in with the old address or password.
    await agent().post('/api/auth/login').send({ email: columnist.user.email, password: TEST_PASSWORD }).expect(401);
  });

  it('lets the admin delete any account but their own', async () => {
    const admin = await makeAdmin();
    const reader = await makeUser();
    const { client } = await loginAs(admin.email);

    await client.delete(`/api/admin/users/${reader.id}`).expect(204);
    expect(await prisma.user.findUnique({ where: { id: reader.id } })).toBeNull();

    await client.delete(`/api/admin/users/${admin.id}`).expect(403);
  });

  it('never deletes the last active admin', async () => {
    await prisma.user.updateMany({ where: { role: 'admin' }, data: { active: false } });
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client.delete('/api/auth/me').send({ password: TEST_PASSWORD }).expect(409);
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it('keeps readers away from the admin route', async () => {
    const { client } = await asReader();
    const other = await makeUser();

    await client.delete(`/api/admin/users/${other.id}`).expect(403);
  });
});
