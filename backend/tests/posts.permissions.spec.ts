import { describe, expect, it } from 'vitest';
import { agent, loginAs } from './helpers/agent';
import {
  makeAdmin,
  makeCategory,
  makeColumn,
  makeColumnist,
  makeMedia,
  makeNews,
  makeUser,
  makeWriter,
} from './factories';

// The three tests that matter.
//
// All three assert a refusal, not a success. A permission test that only walks
// the happy path proves nothing: what needs proving is that the door is shut.
//
// They run against a real Postgres on purpose. With a mocked repository the
// assertion would pass even with a broken WHERE clause, because the mock
// returns whatever it was told to.
describe('permissões das colunas', () => {
  it('não deixa o colunista publicar a própria coluna', async () => {
    const { user, author } = await makeColumnist();
    const column = await makeColumn({ authorId: author.id, createdById: user.id });

    const { client } = await loginAs(user.email);

    // There is no publish route under /columnist at all, which is the design:
    // a columnist has no endpoint capable of writing status = 'published'.
    await client.post(`/api/columnist/posts/${column.id}/publish`).expect(404);

    // And the admin route rejects them by role.
    await client.post(`/api/admin/posts/${column.id}/publish`).expect(403);

    // Submitting for review is what they are allowed to do.
    const submitted = await client
      .post(`/api/columnist/posts/${column.id}/submit`)
      .expect(200);

    expect(submitted.body.data.post.status).toBe('pending');
  });

  it('não deixa o colunista editar uma coluna publicada', async () => {
    const admin = await makeAdmin();
    const { user, author } = await makeColumnist();

    const column = await makeColumn(
      { authorId: author.id, createdById: user.id },
      { status: 'published', publishedAt: new Date(), publishedById: admin.id },
    );

    const { client } = await loginAs(user.email);

    const response = await client
      .patch(`/api/columnist/posts/${column.id}`)
      .send({ title: 'Trying to fix a typo' })
      .expect(403);

    expect(response.body.error.code).toBe('FORBIDDEN');

    // The admin still can — that is the trade-off we accepted, and what the
    // client has to be told during training.
    const { client: adminClient } = await loginAs(admin.email);

    await adminClient
      .patch(`/api/admin/posts/${column.id}`)
      .send({ title: 'Typo fixed by the admin' })
      .expect(200);
  });

  it('não deixa o colunista mexer na coluna de outro', async () => {
    const first = await makeColumnist();
    const second = await makeColumnist();

    const foreignColumn = await makeColumn({
      authorId: second.author.id,
      createdById: second.user.id,
    });

    const { client } = await loginAs(first.user.email);

    await client
      .patch(`/api/columnist/posts/${foreignColumn.id}`)
      .send({ title: 'Not mine' })
      .expect(403);

    await client.delete(`/api/columnist/posts/${foreignColumn.id}`).expect(403);

    // Not even readable: canViewInPanel is ownership-based too.
    await client.get(`/api/columnist/posts/${foreignColumn.id}`).expect(403);
  });
});

describe('o que o colunista enxerga', () => {
  it('nunca lista matérias de outra pessoa', async () => {
    const first = await makeColumnist();
    const second = await makeColumnist();

    await makeColumn({ authorId: first.author.id, createdById: first.user.id });
    await makeColumn({ authorId: second.author.id, createdById: second.user.id });

    const { client } = await loginAs(first.user.email);

    const response = await client.get('/api/columnist/posts').expect(200);
    const items = response.body.data.items as { id: string }[];

    expect(items).toHaveLength(1);
  });

  it('ignora um authorId passado no endereço', async () => {
    const first = await makeColumnist();
    const second = await makeColumnist();

    await makeColumn({ authorId: second.author.id, createdById: second.user.id });

    const { client } = await loginAs(first.user.email);

    // Filtering happens in the WHERE clause from the session, so this
    // parameter cannot widen the result set.
    const response = await client
      .get(`/api/columnist/posts?authorId=${second.author.id}`)
      .expect(200);

    expect(response.body.data.items).toHaveLength(0);
  });

  it('ao criar, a assinatura é sempre a do próprio colunista; sem tipo, é coluna', async () => {
    const { user, author } = await makeColumnist();
    const other = await makeWriter();
    const category = await makeCategory();

    const { client } = await loginAs(user.email);

    const response = await client
      .post('/api/columnist/posts')
      .send({
        title: 'My opinion piece',
        content: '<p>Text.</p>',
        // Ignored: the byline comes from the session, and a column has no
        // category.
        authorId: other.id,
        categoryId: category.id,
      })
      .expect(201);

    const post = response.body.data.post;

    expect(post.type).toBe('column');
    expect(post.authorId).toBe(author.id);
    expect(post.categoryId).toBeNull();
    expect(post.status).toBe('draft');
  });
});

describe('notícias de colunista', () => {
  async function newsFromColumnist() {
    const columnist = await makeColumnist();
    const category = await makeCategory();
    const { client } = await loginAs(columnist.user.email);
    const response = await client
      .post('/api/columnist/posts')
      .send({ type: 'news', title: 'Buraco na avenida', content: '<p>Texto.</p>', categoryId: category.id })
      .expect(201);
    return { ...columnist, category, client, post: response.body.data.post };
  }

  it('o colunista escreve uma notícia, assinada por ele, na categoria escolhida', async () => {
    const { author, category, post } = await newsFromColumnist();
    expect(post).toMatchObject({ type: 'news', status: 'draft', authorId: author.id, categoryId: category.id });
  });

  it('notícia de colunista precisa de categoria', async () => {
    const { user } = await makeColumnist();
    const { client } = await loginAs(user.email);
    const response = await client.post('/api/columnist/posts').send({ type: 'news', title: 'Sem categoria' }).expect(422);
    expect(response.body.error.fields).toHaveProperty('categoryId');
  });

  it('envia para revisão, mas só o admin publica', async () => {
    const { client, post, user } = await newsFromColumnist();
    const cover = await makeMedia(user.id);
    await client.patch(`/api/columnist/posts/${post.id}`).send({ coverId: cover.id }).expect(200);

    const submitted = await client.post(`/api/columnist/posts/${post.id}/submit`).expect(200);
    expect(submitted.body.data.post.status).toBe('pending');
    await client.post(`/api/admin/posts/${post.id}/publish`).expect(403);

    const admin = await makeAdmin();
    const asAdmin = (await loginAs(admin.email)).client;
    // In Revisão, under "Notícias" (written in the panel), not "Notícias automáticas".
    const manual = await asAdmin.get('/api/admin/posts?status=pending&type=news&origin=manual').expect(200);
    expect(manual.body.data.items.map((p: { id: string }) => p.id)).toEqual([post.id]);
    const imported = await asAdmin.get('/api/admin/posts?status=pending&type=news&origin=imported').expect(200);
    expect(imported.body.data.items).toHaveLength(0);

    const published = await asAdmin.post(`/api/admin/posts/${post.id}/publish`).expect(200);
    expect(published.body.data.post.status).toBe('published');
  });

  it('o colunista troca a categoria da própria notícia, mas não a assinatura', async () => {
    const { client, post } = await newsFromColumnist();
    const other = await makeCategory();
    const writer = await makeWriter();
    const moved = await client.patch(`/api/columnist/posts/${post.id}`).send({ categoryId: other.id }).expect(200);
    expect(moved.body.data.post.categoryId).toBe(other.id);
    await client.patch(`/api/columnist/posts/${post.id}`).send({ authorId: writer.id }).expect(403);
  });

  it('notícia que o admin escreveu com o nome do colunista continua sendo só do admin', async () => {
    const { user, author } = await makeColumnist();
    const admin = await makeAdmin();
    const category = await makeCategory();
    const news = await makeNews({ authorId: author.id, createdById: admin.id, categoryId: category.id });

    const { client } = await loginAs(user.email);
    const list = await client.get('/api/columnist/posts').expect(200);
    expect(list.body.data.items).toHaveLength(0);
    await client.get(`/api/columnist/posts/${news.id}`).expect(403);
    await client.patch(`/api/columnist/posts/${news.id}`).send({ title: 'Mudei' }).expect(403);
  });

  it('a lista do colunista mostra as colunas e as notícias dele', async () => {
    const { client, author, user } = await newsFromColumnist();
    await makeColumn({ authorId: author.id, createdById: user.id });
    const all = await client.get('/api/columnist/posts').expect(200);
    expect(all.body.data.items.map((p: { type: string }) => p.type).sort()).toEqual(['column', 'news']);
    const onlyNews = await client.get('/api/columnist/posts?type=news').expect(200);
    expect(onlyNews.body.data.items).toHaveLength(1);
  });
});

describe('acesso ao painel', () => {
  it('não deixa leitor entrar em nenhum dos painéis', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();
    const news = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    const reader = await makeUser();

    const { client } = await loginAs(reader.email);

    await client.get('/api/admin/posts').expect(403);
    await client.get('/api/columnist/posts').expect(403);
    await client.post(`/api/admin/posts/${news.id}/publish`).expect(403);
  });

  it('recusa acesso ao painel sem login', async () => {
    const client = agent();

    const response = await client.get('/api/admin/posts').expect(401);
    expect(response.body.error.code).toBe('UNAUTHENTICATED');
  });
});
