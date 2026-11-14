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

describe('endereço das matérias', () => {
  it('acompanha o título enquanto a matéria nunca foi publicada', async () => {
    const { client, post } = await newsDraft('Teste');
    expect(post.slug).toBe('teste');

    const updated = await client
      .patch(`/api/admin/posts/${post.id}`)
      .send({ title: 'Feira da praça ganha cobertura' })
      .expect(200);

    expect(updated.body.data.post.slug).toBe('feira-da-praca-ganha-cobertura');
  });

  it('ganha um número quando o título novo já está em uso', async () => {
    const first = await newsDraft('Chuva forte');
    const { client, post } = await newsDraft('Rascunho');
    expect(first.post.slug).toBe('chuva-forte');

    const updated = await client.patch(`/api/admin/posts/${post.id}`).send({ title: 'Chuva forte' }).expect(200);

    expect(updated.body.data.post.slug).toBe('chuva-forte-2');
  });

  it('fica fixo quando digitado à mão', async () => {
    const { client, post } = await newsDraft('Teste', { slug: 'feira-2026' });

    const updated = await client.patch(`/api/admin/posts/${post.id}`).send({ title: 'Outro título' }).expect(200);

    expect(updated.body.data.post.slug).toBe('feira-2026');
  });

  it('para de acompanhar depois de publicada, mesmo saindo do ar', async () => {
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

  it('ainda muda quando o admin digita outro depois de publicar', async () => {
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

  it('acompanha o título do rascunho do colunista também', async () => {
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

describe('endereço dos autores', () => {
  it('acompanha o nome quando o admin renomeia', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter({ name: 'Maria Souza', slug: 'maria-souza' });
    const { client } = await loginAs(admin.email);

    const updated = await client.patch(`/api/admin/authors/${writer.id}`).send({ name: 'Maria Souza Lima' }).expect(200);

    expect(updated.body.data.author.slug).toBe('maria-souza-lima');
  });

  it('acompanha o nome quando o colunista muda o próprio nome', async () => {
    const { user } = await makeColumnist({ name: 'Joana Lima', slug: 'joana-lima' });
    const { client } = await loginAs(user.email);

    const updated = await client.patch('/api/columnist/profile').send({ name: 'Joana Lima Prado' }).expect(200);

    expect(updated.body.data.author.slug).toBe('joana-lima-prado');
  });

  it('fica fixo quando digitado à mão, ou quando o novo já é de outra pessoa', async () => {
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
