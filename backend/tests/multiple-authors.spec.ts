import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumn, makeColumnist, makeMedia, makeUser, makeWriter } from './factories';

// One login writing under several authors: a columnist who also publishes
// for a friend. Only the admin decides which authors a login holds; the
// columnist picks, text by text, which of them signs it.

async function adminClient() {
  return (await loginAs((await makeAdmin()).email)).client;
}

// A columnist plus a friend's author tied to the same login by the admin.
async function columnistWithFriend() {
  const admin = await adminClient();
  const { user, author: own } = await makeColumnist({ name: 'Ana' });
  const friend = await makeWriter({ name: 'Beto Amigo' });
  await admin.put(`/api/admin/users/${user.id}/authors`).send({ authorIds: [own.id, friend.id] }).expect(200);
  const { client } = await loginAs(user.email);
  return { admin, user, own, friend, client };
}

describe('vários autores numa conta (ADM)', () => {
  it('o ADM liga dois autores à mesma conta; os dois ficam como colunistas', async () => {
    const admin = await adminClient();
    const reader = await makeUser();
    const a = await makeWriter({ name: 'Autor A' });
    const b = await makeWriter({ name: 'Autor B' });

    const res = await admin.put(`/api/admin/users/${reader.id}/authors`).send({ authorIds: [a.id, b.id] }).expect(200);

    expect(res.body.data.user.role).toBe('columnist');
    expect(res.body.data.user.authors.map((x: { id: string }) => x.id).sort()).toEqual([a.id, b.id].sort());
    const rows = await prisma.author.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(rows.every((row) => row.userId === reader.id && row.type === 'columnist')).toBe(true);
  });

  it('tirar um autor da lista solta só ele; a conta continua colunista', async () => {
    const { admin, user, own, friend } = await columnistWithFriend();

    const res = await admin.put(`/api/admin/users/${user.id}/authors`).send({ authorIds: [own.id] }).expect(200);

    expect(res.body.data.user.role).toBe('columnist');
    expect(res.body.data.user.authors.map((x: { id: string }) => x.id)).toEqual([own.id]);
    expect((await prisma.author.findUniqueOrThrow({ where: { id: friend.id } })).userId).toBeNull();
  });

  it('recusa autor repetido na lista', async () => {
    const admin = await adminClient();
    const reader = await makeUser();
    const a = await makeWriter();
    await admin.put(`/api/admin/users/${reader.id}/authors`).send({ authorIds: [a.id, a.id] }).expect(422);
  });

  it('promover quem já é colunista cria mais um autor na mesma conta', async () => {
    const admin = await adminClient();
    const { user, author } = await makeColumnist();

    const res = await admin.post(`/api/admin/users/${user.id}/promote`).send({ name: 'Carlos Amigo' }).expect(200);

    const slugs = res.body.data.user.authors.map((x: { slug: string }) => x.slug);
    expect(slugs).toContain(author.slug);
    expect(slugs).toContain('carlos-amigo');
  });

  it('excluir um dos autores não tira a conta do painel', async () => {
    const { admin, user, friend } = await columnistWithFriend();

    await admin.delete(`/api/admin/authors/${friend.id}`).expect(204);

    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role).toBe('columnist');
  });

  it('o colunista não muda os autores da própria conta', async () => {
    const { user, client } = await columnistWithFriend();
    const other = await makeWriter();
    await client.put(`/api/admin/users/${user.id}/authors`).send({ authorIds: [other.id] }).expect(403);
  });
});

describe('colunista com vários autores', () => {
  it('/auth/me traz os dois autores', async () => {
    const { client, own, friend } = await columnistWithFriend();
    const me = await client.get('/api/auth/me').expect(200);
    const ids = me.body.data.user.authors.map((x: { id: string }) => x.id);
    expect(ids.sort()).toEqual([own.id, friend.id].sort());
  });

  it('escolhe qual autor assina; sem escolher, vai o primeiro', async () => {
    const { client, friend } = await columnistWithFriend();

    const asFriend = await client
      .post('/api/columnist/posts')
      .send({ title: 'Coluna do amigo', content: '<p>Texto.</p>', authorId: friend.id })
      .expect(201);
    expect(asFriend.body.data.post.authorId).toBe(friend.id);

    const me = await client.get('/api/auth/me').expect(200);
    const first = me.body.data.user.authors[0].id;
    const plain = await client.post('/api/columnist/posts').send({ title: 'Sem escolher' }).expect(201);
    expect(plain.body.data.post.authorId).toBe(first);
  });

  it('não assina com autor de fora da conta', async () => {
    const { client } = await columnistWithFriend();
    const stranger = await makeWriter();
    await client.post('/api/columnist/posts').send({ title: 'Tentativa', authorId: stranger.id }).expect(403);
  });

  it('vê, edita e troca entre os próprios autores, mas não para um de fora', async () => {
    const { client, user, own, friend } = await columnistWithFriend();
    const column = await makeColumn({ authorId: friend.id, createdById: user.id });

    const list = await client.get('/api/columnist/posts').expect(200);
    expect(list.body.data.items.map((p: { id: string }) => p.id)).toContain(column.id);

    const moved = await client.patch(`/api/columnist/posts/${column.id}`).send({ authorId: own.id }).expect(200);
    expect(moved.body.data.post.authorId).toBe(own.id);

    const stranger = await makeWriter();
    await client.patch(`/api/columnist/posts/${column.id}`).send({ authorId: stranger.id }).expect(403);
    await client.patch(`/api/columnist/posts/${column.id}`).send({ authorId: null }).expect(403);
  });

  it('a notícia do amigo aparece na página do amigo depois de publicada', async () => {
    const { client, admin, friend, user } = await columnistWithFriend();
    const category = await makeCategory();
    const cover = await makeMedia(user.id);
    const created = await client
      .post('/api/columnist/posts')
      .send({ type: 'news', title: 'Notícia do amigo', content: '<p>Texto.</p>', categoryId: category.id, authorId: friend.id, coverId: cover.id })
      .expect(201);
    const id = created.body.data.post.id;
    await admin.post(`/api/admin/posts/${id}/publish`).expect(200);

    const page = await agent().get(`/api/posts?author=${friend.slug}`).expect(200);
    expect(page.body.data.items.map((p: { id: string }) => p.id)).toContain(id);
  });

  it('edita o perfil de qualquer um dos seus autores, e só deles', async () => {
    const { client, friend } = await columnistWithFriend();

    const res = await client.patch('/api/columnist/profile').send({ authorId: friend.id, bio: 'Amigo da Ana.' }).expect(200);
    expect(res.body.data.author.bio).toBe('Amigo da Ana.');

    const stranger = await makeWriter();
    await client.patch('/api/columnist/profile').send({ authorId: stranger.id, bio: 'x' }).expect(403);
  });
});
