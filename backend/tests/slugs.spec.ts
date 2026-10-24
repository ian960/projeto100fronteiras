import { describe, expect, it } from 'vitest';
import { loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumnist, makeMedia, makeWriter } from './factories';

// An address made from a title or a name follows it; one typed by hand stays.
// A post stops following its headline once it has been published, because by
// then the link is out there.

async function newsDraft(title: string, extra: Record<string, unknown> = {}) {
  const admin = await makeAdmin();
  const writer = await makeWriter();
  const category = await makeCategory();
  const { client } = await loginAs(admin.email);

  const created = await client
    .post('/api/admin/posts')
    .send({ type: 'news', title, authorId: writer.id, categoryId: category.id, ...extra })
    .expect(201);

  return { admin, client, post: created.body.data.post };
}

describe('post slugs', () => {
  it('follow the headline while the post was never published', async () => {
    const { client, post } = await newsDraft('Teste');
    expect(post.slug).toBe('teste');

    const updated = await client
      .patch(`/api/admin/posts/${post.id}`)
      .send({ title: 'Feira da praça ganha cobertura' })
      .expect(200);

    expect(updated.body.data.post.slug).toBe('feira-da-praca-ganha-cobertura');
  });

  it('get a suffix when the new headline is already taken', async () => {
    const first = await newsDraft('Chuva forte');
    const { client, post } = await newsDraft('Rascunho');
    expect(first.post.slug).toBe('chuva-forte');

    const updated = await client.patch(`/api/admin/posts/${post.id}`).send({ title: 'Chuva forte' }).expect(200);

    expect(updated.body.data.post.slug).toBe('chuva-forte-2');
  });

  it('stay when typed by hand', async () => {
    const { client, post } = await newsDraft('Teste', { slug: 'feira-2026' });

    const updated = await client.patch(`/api/admin/posts/${post.id}`).send({ title: 'Outro título' }).expect(200);

    expect(updated.body.data.post.slug).toBe('feira-2026');
  });

  it('stop following once published, even after going offline', async () => {
    const { admin, client, post } = await newsDraft('Título publicado');
    const cover = await makeMedia(admin.id);

    await client
      .patch(`/api/admin/posts/${post.id}`)
      .send({ excerpt: 'Resumo.', content: '<p>Texto.</p>', coverId: cover.id })
      .expect(200);
    await client.post(`/api/admin/posts/${post.id}/publish`).expect(200);

    const renamed = await client.patch(`/api/admin/posts/${post.id}`).send({ title: 'Título corrigido' }).expect(200);
    expect(renamed.body.data.post.slug).toBe('titulo-publicado');

    await client.post(`/api/admin/posts/${post.id}/unpublish`).expect(200);
    const offline = await client.patch(`/api/admin/posts/${post.id}`).send({ title: 'Outra correção' }).expect(200);
    expect(offline.body.data.post.slug).toBe('titulo-publicado');
  });

  it('still change when the admin types a new one after publishing', async () => {
    const { admin, client, post } = await newsDraft('Antes');
    const cover = await makeMedia(admin.id);
    await client
      .patch(`/api/admin/posts/${post.id}`)
      .send({ excerpt: 'Resumo.', content: '<p>Texto.</p>', coverId: cover.id })
      .expect(200);
    await client.post(`/api/admin/posts/${post.id}/publish`).expect(200);

    const updated = await client.patch(`/api/admin/posts/${post.id}`).send({ slug: 'Depois' }).expect(200);

    expect(updated.body.data.post.slug).toBe('depois');
  });

  it('follow the headline of a columnist draft too', async () => {
    const { user } = await makeColumnist();
    const { client } = await loginAs(user.email);

    const created = await client.post('/api/columnist/posts').send({ title: 'Ideia solta' }).expect(201);
    const updated = await client
      .patch(`/api/columnist/posts/${created.body.data.post.id}`)
      .send({ title: 'A fronteira que nos une' })
      .expect(200);

    expect(updated.body.data.post.slug).toBe('a-fronteira-que-nos-une');
  });
});

describe('author slugs', () => {
  it('follow the name when the admin renames', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter({ name: 'Maria Souza', slug: 'maria-souza' });
    const { client } = await loginAs(admin.email);

    const updated = await client.patch(`/api/admin/authors/${writer.id}`).send({ name: 'Maria Souza Lima' }).expect(200);

    expect(updated.body.data.author.slug).toBe('maria-souza-lima');
  });

  it('follow the name when columnists rename themselves', async () => {
    const { user } = await makeColumnist({ name: 'Joana Lima', slug: 'joana-lima' });
    const { client } = await loginAs(user.email);

    const updated = await client.patch('/api/columnist/profile').send({ name: 'Joana Lima Prado' }).expect(200);

    expect(updated.body.data.author.slug).toBe('joana-lima-prado');
  });

  it('stay when typed by hand, or when the new one belongs to someone else', async () => {
    const admin = await makeAdmin();
    const custom = await makeWriter({ name: 'Pedro Alves', slug: 'pedrinho' });
    await makeWriter({ name: 'Ana Costa', slug: 'ana-costa' });
    const other = await makeWriter({ name: 'Ana C.', slug: 'ana-c' });
    const { client } = await loginAs(admin.email);

    const kept = await client.patch(`/api/admin/authors/${custom.id}`).send({ name: 'Pedro Alves Filho' }).expect(200);
    expect(kept.body.data.author.slug).toBe('pedrinho');

    const clash = await client.patch(`/api/admin/authors/${other.id}`).send({ name: 'Ana Costa' }).expect(200);
    expect(clash.body.data.author).toMatchObject({ name: 'Ana Costa', slug: 'ana-c' });
  });
});
