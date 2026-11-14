import { describe, expect, it } from 'vitest';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeNews, makeWriter } from './factories';

describe('editorias', () => {
  it('monta o endereço sem acentos', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const response = await client
      .post('/api/admin/categories')
      .send({ name: 'Política' })
      .expect(201);

    // Without NFD normalization this would come out as "pol-tica".
    expect(response.body.data.category.slug).toBe('politica');
  });

  it('recusa endereço repetido', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client.post('/api/admin/categories').send({ name: 'Esportes' }).expect(201);

    const response = await client
      .post('/api/admin/categories')
      .send({ name: 'esportes' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('muda o endereço gerado pelo nome quando o nome muda', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const createdResponse = await client
      .post('/api/admin/categories')
      .send({ name: 'Politica' })
      .expect(201);

    const id = createdResponse.body.data.category.id;

    const updated = await client
      .patch(`/api/admin/categories/${id}`)
      .send({ name: 'Política e Poder' })
      .expect(200);

    expect(updated.body.data.category.slug).toBe('politica-e-poder');
  });

  it('mantém o endereço digitado à mão quando o nome muda', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const createdResponse = await client
      .post('/api/admin/categories')
      .send({ name: 'Cidade', slug: 'nossa-cidade' })
      .expect(201);

    const id = createdResponse.body.data.category.id;

    const updated = await client
      .patch(`/api/admin/categories/${id}`)
      .send({ name: 'Cidade e Região' })
      .expect(200);

    expect(updated.body.data.category.slug).toBe('nossa-cidade');
  });

  it('renomeia mesmo com o endereço novo ocupado, mantendo o antigo', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    // Different names, same slug: "Saúde" and "Saude" both make "saude".
    await client.post('/api/admin/categories').send({ name: 'Saúde' }).expect(201);
    const other = await client.post('/api/admin/categories').send({ name: 'Bem-estar' }).expect(201);

    const updated = await client
      .patch(`/api/admin/categories/${other.body.data.category.id}`)
      .send({ name: 'Saude' })
      .expect(200);

    expect(updated.body.data.category).toMatchObject({ name: 'Saude', slug: 'bem-estar' });
  });

  it('recusa excluir editoria com matérias e diz quantas', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();

    await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    const { client } = await loginAs(admin.email);

    const response = await client
      .delete(`/api/admin/categories/${category.id}`)
      .expect(409);

    expect(response.body.error.message).toContain('1 post');
  });

  it('recusa uma edição vazia', async () => {
    const admin = await makeAdmin();
    const category = await makeCategory();
    const { client } = await loginAs(admin.email);

    await client.patch(`/api/admin/categories/${category.id}`).send({}).expect(422);
  });

  it('esconde editorias inativas da lista pública', async () => {
    await makeCategory({ name: 'Visible', slug: 'visible' });
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    const response = await agent().get('/api/categories').expect(200);
    const slugs = (response.body.data.categories as { slug: string }[]).map((c) => c.slug);

    expect(slugs).toContain('visible');
    expect(slugs).not.toContain('hidden');
  });
});

describe('formato dos erros', () => {
  it('responde JSON, não HTML, para rota que não existe', async () => {
    const response = await agent().get('/api/does-not-exist').expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
