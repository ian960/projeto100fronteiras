import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumn, makeColumnist, makeNews, makeWriter } from './factories';

async function adminContext() {
  const admin = await makeAdmin();
  const writer = await makeWriter();
  const category = await makeCategory();
  const { client } = await loginAs(admin.email);

  return { admin, writer, category, client };
}

describe('assinatura da notícia', () => {
  it('cria notícia sem assinatura', async () => {
    const { category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Sem assinatura', categoryId: category.id, authorId: null })
      .expect(201);

    expect(response.body.data.post.authorId).toBeNull();
    expect(response.body.data.post.bylineName).toBeNull();
    expect(response.body.data.post.author).toBeNull();
  });

  it('cria notícia sem mandar authorId nenhum', async () => {
    const { category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Campo omitido', categoryId: category.id })
      .expect(201);

    expect(response.body.data.post.authorId).toBeNull();
  });

  it('cria notícia assinada com nome livre', async () => {
    const { category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Nome livre', categoryId: category.id, bylineName: '  Da Redação, com Agência Brasil ' })
      .expect(201);

    expect(response.body.data.post.authorId).toBeNull();
    expect(response.body.data.post.bylineName).toBe('Da Redação, com Agência Brasil');
  });

  it('recusa autor e nome livre ao mesmo tempo', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Os dois', categoryId: category.id, authorId: writer.id, bylineName: 'Fulano' })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('bylineName');
  });

  it('coluna continua exigindo colunista', async () => {
    const { client } = await adminContext();

    await client.post('/api/admin/posts').send({ type: 'column', title: 'Coluna sem autor' }).expect(422);
    await client
      .post('/api/admin/posts')
      .send({ type: 'column', title: 'Coluna nome livre', bylineName: 'Fulano' })
      .expect(422);

    const admin = await makeAdmin();
    const { author } = await makeColumnist();
    const column = await makeColumn({ authorId: author.id, createdById: admin.id });
    await client.patch(`/api/admin/posts/${column.id}`).send({ authorId: null }).expect(422);
    await client.patch(`/api/admin/posts/${column.id}`).send({ bylineName: 'Outro' }).expect(422);
  });

  it('troca entre autor, nome livre e sem assinatura na edição', async () => {
    const { admin, writer, category, client } = await adminContext();
    const draft = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    // Typing a name replaces the registered author.
    const named = await client.patch(`/api/admin/posts/${draft.id}`).send({ bylineName: 'Correspondente' }).expect(200);
    expect(named.body.data.post.authorId).toBeNull();
    expect(named.body.data.post.bylineName).toBe('Correspondente');

    // Editing something else keeps the typed name.
    const kept = await client.patch(`/api/admin/posts/${draft.id}`).send({ title: 'Outro título' }).expect(200);
    expect(kept.body.data.post.bylineName).toBe('Correspondente');

    // No byline at all.
    const none = await client.patch(`/api/admin/posts/${draft.id}`).send({ authorId: null, bylineName: null }).expect(200);
    expect(none.body.data.post.authorId).toBeNull();
    expect(none.body.data.post.bylineName).toBeNull();

    // Back to a registered author.
    const back = await client.patch(`/api/admin/posts/${draft.id}`).send({ authorId: writer.id }).expect(200);
    expect(back.body.data.post.authorId).toBe(writer.id);
    expect(back.body.data.post.bylineName).toBeNull();
  });

  it('colunista não muda assinatura', async () => {
    const admin = await makeAdmin();
    const { user, author } = await makeColumnist();
    const column = await makeColumn({ authorId: author.id, createdById: admin.id });
    const { client } = await loginAs(user.email);

    await client.patch(`/api/columnist/posts/${column.id}`).send({ bylineName: 'Outro nome' }).expect(403);
  });

  it('o banco recusa autor e nome juntos, e coluna sem autor', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();

    await expect(
      makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id }, { bylineName: 'Fulano' }),
    ).rejects.toThrow();

    await expect(
      prisma.post.create({
        data: { type: 'column', title: 'Sem autor', slug: 'coluna-sem-autor', createdById: admin.id },
      }),
    ).rejects.toThrow();
  });

  it('site público mostra notícia sem assinatura e com nome livre', async () => {
    const { admin, category, client } = await adminContext();
    const unsigned = await makeNews({ authorId: null as unknown as string, createdById: admin.id, categoryId: category.id });
    const named = await makeNews(
      { authorId: null as unknown as string, createdById: admin.id, categoryId: category.id },
      { bylineName: 'Agência Brasil' },
    );

    await client.post(`/api/admin/posts/${unsigned.id}/publish`).expect(200);
    await client.post(`/api/admin/posts/${named.id}/publish`).expect(200);
    await client.post(`/api/admin/posts/${named.id}/feature`).expect(200);

    const detail = await agent().get(`/api/posts/${named.slug}`).expect(200);
    expect(detail.body.data.post.author).toBeNull();
    expect(detail.body.data.post.bylineName).toBe('Agência Brasil');

    const list = await agent().get('/api/posts?type=news').expect(200);
    const item = list.body.data.items.find((post: { id: string }) => post.id === named.id);
    expect(item.bylineName).toBe('Agência Brasil');
    expect(item.author).toBeNull();

    await agent().get('/api/home').expect(200);
    await agent().get(`/api/posts/${unsigned.slug}`).expect(200);
    await agent().get(`/api/posts/${unsigned.slug}/related`).expect(200);
    await agent().get(`/api/comments?postId=${unsigned.id}`).expect(200);
    await client.get('/api/admin/posts').expect(200);
    await agent().get("/api/sitemap").expect(200);
  });
});
