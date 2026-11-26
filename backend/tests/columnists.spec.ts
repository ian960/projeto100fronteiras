import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeColumn, makeColumnist, makeUser, makeWriter } from './factories';

// The public columnists tab (/colunistas): every active columnist, with how
// many columns they published and the newest one.
describe('aba de colunistas', () => {
  it('mostra a contagem e a última coluna publicada de cada colunista', async () => {
    const { user, author } = await makeColumnist({ name: 'Ana Colunista' });
    const ref = { authorId: author.id, createdById: user.id };

    await makeColumn(ref, { status: 'published', title: 'Antiga', publishedAt: new Date('2026-01-01') });
    await makeColumn(ref, { status: 'published', title: 'Nova', publishedAt: new Date('2026-02-01') });
    await makeColumn(ref, { status: 'draft', title: 'Rascunho' });
    await makeColumn(ref, { status: 'pending', title: 'Em revisão' });

    const res = await agent().get('/api/columnists').expect(200);
    const card = res.body.data.authors.find((item: { id: string }) => item.id === author.id);

    expect(card.columnCount).toBe(2);
    expect(card.latestColumn).toMatchObject({ title: 'Nova' });
    expect(card.name).toBe('Ana Colunista');
  });

  it('lista todos os autores ativos, redatores também, menos a Redação e os desativados', async () => {
    const { author: fresh } = await makeColumnist();
    const { author: inactive } = await makeColumnist({ active: false });
    const writer = await makeWriter();
    const newsroom = await makeWriter({ slug: 'redacao', name: 'Redação' });

    const res = await agent().get('/api/columnists').expect(200);
    const ids = res.body.data.authors.map((item: { id: string }) => item.id);
    const card = res.body.data.authors.find((item: { id: string }) => item.id === fresh.id);

    expect(card).toMatchObject({ columnCount: 0, latestColumn: null });
    expect(ids).toContain(writer.id);
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(newsroom.id);
  });
});

describe('ligar conta a autor (ADM)', () => {
  async function admin() {
    const user = await makeAdmin();
    return (await loginAs(user.email)).client;
  }

  it('liga um leitor a um redator que já existe: vira colunista e o autor também', async () => {
    const client = await admin();
    const reader = await makeUser();
    const writer = await makeWriter();

    const res = await client.put(`/api/admin/users/${reader.id}/authors`).send({ authorIds: [writer.id] }).expect(200);
    expect(res.body.data.user.role).toBe('columnist');
    expect(res.body.data.user.authors.map((a: { id: string }) => a.id)).toEqual([writer.id]);

    const author = await prisma.author.findUniqueOrThrow({ where: { id: writer.id } });
    expect(author).toMatchObject({ userId: reader.id, type: 'columnist' });

    // The columnist logs in and writes under that byline.
    const { client: own } = await loginAs(reader.email);
    const me = await own.get('/api/auth/me').expect(200);
    expect(JSON.stringify(me.body)).toContain(writer.id);
  });

  it('troca de autor: o antigo fica, sem conta, com as colunas', async () => {
    const client = await admin();
    const { user, author: old } = await makeColumnist();
    await makeColumn({ authorId: old.id, createdById: user.id }, { status: 'published', publishedAt: new Date() });
    const writer = await makeWriter();

    await client.put(`/api/admin/users/${user.id}/authors`).send({ authorIds: [writer.id] }).expect(200);

    const before = await prisma.author.findUniqueOrThrow({ where: { id: old.id }, include: { _count: { select: { posts: true } } } });
    expect(before.userId).toBeNull();
    expect(before._count.posts).toBe(1);
  });

  it('desliga: a conta volta a leitor e o autor continua', async () => {
    const client = await admin();
    const { user, author } = await makeColumnist();

    const res = await client.put(`/api/admin/users/${user.id}/authors`).send({ authorIds: [] }).expect(200);
    expect(res.body.data.user.role).toBe('reader');
    expect(res.body.data.user.authors).toEqual([]);
    expect(await prisma.author.findUnique({ where: { id: author.id } })).not.toBeNull();
  });

  it('recusa autor já ligado a outra conta, desativado ou o próprio ADM', async () => {
    const client = await admin();
    const { author: taken } = await makeColumnist();
    const inactive = await makeWriter({ active: false });
    const reader = await makeUser();
    const other = await makeAdmin();

    await client.put(`/api/admin/users/${reader.id}/authors`).send({ authorIds: [taken.id] }).expect(409);
    await client.put(`/api/admin/users/${reader.id}/authors`).send({ authorIds: [inactive.id] }).expect(409);
    await client.put(`/api/admin/users/${other.id}/authors`).send({ authorIds: [(await makeWriter()).id] }).expect(409);
  });

  it('só o ADM pode ligar', async () => {
    const { user } = await makeColumnist();
    const writer = await makeWriter();
    const { client } = await loginAs(user.email);
    await client.put(`/api/admin/users/${user.id}/authors`).send({ authorIds: [writer.id] }).expect(403);
  });
});

describe('ordem dos colunistas (ADM)', () => {
  it('a página segue a ordem que o ADM salvou', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);
    const a = await makeWriter({ name: 'Ana' });
    const b = await makeWriter({ name: 'Bruno' });
    const c = await makeWriter({ name: 'Carla' });

    const all = (await client.get('/api/admin/authors').expect(200)).body.data.authors.map((x: { id: string }) => x.id);
    const rest = all.filter((id: string) => ![a.id, b.id, c.id].includes(id));

    await client.put('/api/admin/authors/order').send({ ids: [c.id, a.id, b.id, ...rest] }).expect(200);

    const res = await agent().get('/api/columnists').expect(200);
    const ids = res.body.data.authors.map((x: { id: string }) => x.id).filter((id: string) => [a.id, b.id, c.id].includes(id));
    expect(ids).toEqual([c.id, a.id, b.id]);
  });

  it('autor novo entra no fim da lista', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);
    await makeWriter({ name: 'Zeca', sortOrder: 5 });

    const created = await client.post('/api/admin/authors').send({ name: 'Aaron Novo' }).expect(201);
    expect(created.body.data.author.sortOrder).toBe(6);
  });

  it('recusa id desconhecido, repetido, e quem não é ADM', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);
    const a = await makeWriter();

    await client.put('/api/admin/authors/order').send({ ids: [a.id, '01a20427-0000-7000-8000-000000000000'] }).expect(404);
    await client.put('/api/admin/authors/order').send({ ids: [a.id, a.id] }).expect(422);

    const { user } = await makeColumnist();
    const { client: other } = await loginAs(user.email);
    await other.put('/api/admin/authors/order').send({ ids: [a.id] }).expect(403);
  });
});
