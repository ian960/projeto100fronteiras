import { describe, expect, it } from 'vitest';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeNews, makeWriter } from './factories';

describe('categories', () => {
  it('builds a slug without accents', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const response = await client
      .post('/api/admin/categories')
      .send({ name: 'Política' })
      .expect(201);

    // Without NFD normalization this would come out as "pol-tica".
    expect(response.body.data.category.slug).toBe('politica');
  });

  it('rejects a duplicate slug', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client.post('/api/admin/categories').send({ name: 'Esportes' }).expect(201);

    const response = await client
      .post('/api/admin/categories')
      .send({ name: 'esportes' })
      .expect(409);

    expect(response.body.error.code).toBe('CONFLICT');
  });

  it('keeps the slug when the name changes', async () => {
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

    // Moving the slug on a rename would 404 every shared link.
    expect(updated.body.data.category.slug).toBe('politica');
  });

  it('refuses to delete a category that has posts, and says how many', async () => {
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

  it('rejects an empty patch body', async () => {
    const admin = await makeAdmin();
    const category = await makeCategory();
    const { client } = await loginAs(admin.email);

    await client.patch(`/api/admin/categories/${category.id}`).send({}).expect(422);
  });

  it('hides inactive categories from the public list', async () => {
    await makeCategory({ name: 'Visible', slug: 'visible' });
    await makeCategory({ name: 'Hidden', slug: 'hidden', active: false });

    const response = await agent().get('/api/categories').expect(200);
    const slugs = (response.body.data.categories as { slug: string }[]).map((c) => c.slug);

    expect(slugs).toContain('visible');
    expect(slugs).not.toContain('hidden');
  });
});

describe('error shape', () => {
  it('returns JSON, not HTML, for an unknown route', async () => {
    const response = await agent().get('/api/does-not-exist').expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });
});
