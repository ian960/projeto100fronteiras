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

describe('minha conta', () => {
  it('deixa o leitor mudar o nome e a bio', async () => {
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

  it('nunca deixa ninguém mudar o próprio papel ou e-mail por aqui', async () => {
    const { reader, client } = await asReader();

    await client
      .patch('/api/auth/me')
      .send({ name: 'Tentativa', role: 'admin', email: 'outro@test.local' })
      .expect(200);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: reader.id } });
    expect(stored.role).toBe('reader');
    expect(stored.email).toBe(reader.email);
  });

  it('apaga a bio quando ela vem vazia', async () => {
    const { client } = await asReader();

    await client.patch('/api/auth/me').send({ bio: 'Algo' }).expect(200);
    const response = await client.patch('/api/auth/me').send({ bio: '   ' }).expect(200);

    expect(response.body.data.user.bio).toBeNull();
  });

  it('recusa uma alteração vazia e quem não está logado', async () => {
    const { client } = await asReader();

    const empty = await client.patch('/api/auth/me').send({}).expect(422);
    expect(empty.body.error.code).toBe('VALIDATION_ERROR');

    await agent().patch('/api/auth/me').send({ name: 'Ninguém' }).expect(401);
  });

  it('deixa o leitor enviar uma foto de perfil e usá-la', async () => {
    const { client } = await asReader();

    const media = await uploadMedia(client, 'avatar', pngFile(400, 400));
    const response = await client.patch('/api/auth/me').send({ avatarId: media.id }).expect(200);

    expect(response.body.data.user.avatarId).toBe(media.id);
    expect(response.body.data.user.avatarUrl).toMatch(/c_thumb,g_face,w_256,h_256/);

    const removed = await client.patch('/api/auth/me').send({ avatarId: null }).expect(200);
    expect(removed.body.data.user.avatarUrl).toBeNull();
  });

  it('só deixa o leitor enviar a foto de perfil, nada mais', async () => {
    const { client } = await asReader();

    await client.post('/api/media/signature').send({ purpose: 'avatar' }).expect(200);
    await client.post('/api/media/signature').send({ purpose: 'cover' }).expect(403);
    await client.post('/api/media/signature').send({ purpose: 'video' }).expect(403);
    await client
      .post('/api/media/import')
      .send({ purpose: 'author', url: 'https://example.com/foto.jpg' })
      .expect(403);
  });

  it('recusa como foto uma imagem enviada por outra pessoa', async () => {
    const { client } = await asReader();
    const other = await makeUser();
    const theirs = await makeMedia(other.id, 'image');

    await client.patch('/api/auth/me').send({ avatarId: theirs.id }).expect(403);
  });

  it('recusa um arquivo que não é imagem', async () => {
    const { reader, client } = await asReader();
    const pdf = await makeMedia(reader.id, 'document');

    const response = await client.patch('/api/auth/me').send({ avatarId: pdf.id }).expect(422);
    expect(response.body.error.fields).toHaveProperty('avatarId');
  });
});

describe('excluir a conta', () => {
  it('deixa o leitor excluir a própria conta, com a foto', async () => {
    const { reader, client } = await asReader();
    const media = await uploadMedia(client, 'avatar', pngFile(400, 400));
    await client.patch('/api/auth/me').send({ avatarId: media.id }).expect(200);

    await client.delete('/api/auth/me').send({ password: TEST_PASSWORD }).expect(204);

    expect(await prisma.user.findUnique({ where: { id: reader.id } })).toBeNull();
    expect(await prisma.media.findUnique({ where: { id: media.id } })).toBeNull();
    // The session went with it.
    await client.get('/api/auth/me').expect(401);
  });

  it('pede a senha antes', async () => {
    const { reader, client } = await asReader();

    const response = await client.delete('/api/auth/me').send({ password: 'not-the-password' }).expect(422);

    expect(response.body.error.fields).toHaveProperty('password');
    expect(await prisma.user.findUnique({ where: { id: reader.id } })).not.toBeNull();
  });

  it('mantém as colunas do colunista e apaga os dados da pessoa', async () => {
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

  it('deixa o admin excluir qualquer conta, menos a dele', async () => {
    const admin = await makeAdmin();
    const reader = await makeUser();
    const { client } = await loginAs(admin.email);

    await client.delete(`/api/admin/users/${reader.id}`).expect(204);
    expect(await prisma.user.findUnique({ where: { id: reader.id } })).toBeNull();

    await client.delete(`/api/admin/users/${admin.id}`).expect(403);
  });

  it('nunca exclui o último admin ativo', async () => {
    await prisma.user.updateMany({ where: { role: 'admin' }, data: { active: false } });
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client.delete('/api/auth/me').send({ password: TEST_PASSWORD }).expect(409);
    expect(await prisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it('não deixa leitor usar a rota do admin', async () => {
    const { client } = await asReader();
    const other = await makeUser();

    await client.delete(`/api/admin/users/${other.id}`).expect(403);
  });

  it('esconde as contas excluídas da lista e mostra só na aba Excluídas', async () => {
    const admin = await makeAdmin();
    const columnist = await makeColumnist();
    await makeColumn({ authorId: columnist.author.id, createdById: columnist.user.id });
    const { client } = await loginAs(admin.email);

    await client.delete(`/api/admin/users/${columnist.user.id}`).expect(204);

    const all = await client.get('/api/admin/users').query({ limit: 100 }).expect(200);
    const ids = all.body.data.items.map((user: { id: string }) => user.id);
    expect(ids).not.toContain(columnist.user.id);
    expect(ids).toContain(admin.id);

    const deleted = await client.get('/api/admin/users').query({ deleted: 'true', limit: 100 }).expect(200);
    expect(deleted.body.data.items.map((user: { id: string }) => user.id)).toEqual([columnist.user.id]);
  });

  it('não deixa promover, reativar nem dar senha a uma conta excluída', async () => {
    const admin = await makeAdmin();
    const columnist = await makeColumnist();
    await makeColumn({ authorId: columnist.author.id, createdById: columnist.user.id });
    const { client } = await loginAs(admin.email);
    await client.delete(`/api/admin/users/${columnist.user.id}`).expect(204);

    await client.patch(`/api/admin/users/${columnist.user.id}`).send({ active: true }).expect(409);
    await client
      .post(`/api/admin/users/${columnist.user.id}/reset-password`)
      .send({ newPassword: 'outra-senha-123' })
      .expect(409);
    await client.post(`/api/admin/users/${columnist.user.id}/promote`).send({ name: 'Volta' }).expect(409);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: columnist.user.id } });
    expect(stored.active).toBe(false);
  });

  it('apaga de vez a conta excluída quando o conteúdo dela já saiu', async () => {
    const admin = await makeAdmin();
    const columnist = await makeColumnist();
    const column = await makeColumn({ authorId: columnist.author.id, createdById: columnist.user.id });
    const { client } = await loginAs(admin.email);
    await client.delete(`/api/admin/users/${columnist.user.id}`).expect(204);

    // Still has a post: it has to stay, and the admin is told why.
    await client.delete(`/api/admin/users/${columnist.user.id}`).expect(409);
    expect(await prisma.user.findUnique({ where: { id: columnist.user.id } })).not.toBeNull();

    await prisma.post.delete({ where: { id: column.id } });
    await client.delete(`/api/admin/users/${columnist.user.id}`).expect(204);
    expect(await prisma.user.findUnique({ where: { id: columnist.user.id } })).toBeNull();
  });
});
