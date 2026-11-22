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

  it('lista colunista sem coluna, mas não redator nem colunista desativado', async () => {
    const { author: fresh } = await makeColumnist();
    const { author: inactive } = await makeColumnist({ active: false });
    const writer = await makeWriter();

    const res = await agent().get('/api/columnists').expect(200);
    const ids = res.body.data.authors.map((item: { id: string }) => item.id);
    const card = res.body.data.authors.find((item: { id: string }) => item.id === fresh.id);

    expect(card).toMatchObject({ columnCount: 0, latestColumn: null });
    expect(ids).not.toContain(inactive.id);
    expect(ids).not.toContain(writer.id);
  });
});

describe('redator com coluna', () => {
  it('aparece na aba de colunistas quando publica uma coluna', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter({ name: 'Redator Opinião' });

    let res = await agent().get('/api/columnists').expect(200);
    expect(res.body.data.authors.map((a: { id: string }) => a.id)).not.toContain(writer.id);

    await makeColumn({ authorId: writer.id, createdById: admin.id }, { status: 'published', publishedAt: new Date() });

    res = await agent().get('/api/columnists').expect(200);
    const card = res.body.data.authors.find((a: { id: string }) => a.id === writer.id);
    expect(card).toMatchObject({ columnCount: 1, type: 'writer' });
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

    const res = await client.put(`/api/admin/users/${reader.id}/author`).send({ authorId: writer.id }).expect(200);
    expect(res.body.data.user.role).toBe('columnist');
    expect(res.body.data.user.author.id).toBe(writer.id);

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

    await client.put(`/api/admin/users/${user.id}/author`).send({ authorId: writer.id }).expect(200);

    const before = await prisma.author.findUniqueOrThrow({ where: { id: old.id }, include: { _count: { select: { posts: true } } } });
    expect(before.userId).toBeNull();
    expect(before._count.posts).toBe(1);
  });

  it('desliga: a conta volta a leitor e o autor continua', async () => {
    const client = await admin();
    const { user, author } = await makeColumnist();

    const res = await client.put(`/api/admin/users/${user.id}/author`).send({ authorId: null }).expect(200);
    expect(res.body.data.user.role).toBe('reader');
    expect(res.body.data.user.author).toBeNull();
    expect(await prisma.author.findUnique({ where: { id: author.id } })).not.toBeNull();
  });

  it('recusa autor já ligado a outra conta, desativado ou o próprio ADM', async () => {
    const client = await admin();
    const { author: taken } = await makeColumnist();
    const inactive = await makeWriter({ active: false });
    const reader = await makeUser();
    const other = await makeAdmin();

    await client.put(`/api/admin/users/${reader.id}/author`).send({ authorId: taken.id }).expect(409);
    await client.put(`/api/admin/users/${reader.id}/author`).send({ authorId: inactive.id }).expect(409);
    await client.put(`/api/admin/users/${other.id}/author`).send({ authorId: (await makeWriter()).id }).expect(409);
  });

  it('só o ADM pode ligar', async () => {
    const { user } = await makeColumnist();
    const writer = await makeWriter();
    const { client } = await loginAs(user.email);
    await client.put(`/api/admin/users/${user.id}/author`).send({ authorId: writer.id }).expect(403);
  });
});
