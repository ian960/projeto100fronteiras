import { describe, expect, it } from 'vitest';
import { isMediaConfigured } from '../src/config/cloudinary';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumnist, makeWriter } from './factories';

// How the API behaves with Cloudinary switched off.
//
// This file runs in its own group ("without-cloudinary", see
// vitest.config.mts) with CLOUDINARY_URL empty, so it proves the API is usable
// before anyone has Cloudinary keys.

describe('without Cloudinary', () => {
  it('runs in the right group', () => {
    expect(isMediaConfigured()).toBe(false);
  });

  it('reports uploads as disabled', async () => {
    const response = await agent().get('/api/health').expect(200);

    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.uploads).toBe('disabled');
  });

  it('answers 503 on every media endpoint instead of crashing', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const signature = await client
      .post('/api/media/signature')
      .send({ purpose: 'cover' })
      .expect(503);
    expect(signature.body.error.code).toBe('SERVICE_UNAVAILABLE');

    await client
      .post('/api/media/import')
      .send({ purpose: 'cover', url: 'https://example.com/photo.jpg' })
      .expect(503);
  });

  it('still checks authentication first', async () => {
    // 401, not 503: an anonymous visitor learns nothing about the server's
    // configuration.
    await agent().post('/api/media/signature').send({ purpose: 'cover' }).expect(401);
  });

  it('publishes a column, which needs no cover', async () => {
    const admin = await makeAdmin();
    const { author } = await makeColumnist();
    const { client } = await loginAs(admin.email);

    const post = await client
      .post('/api/admin/posts')
      .send({
        type: 'column',
        title: 'Sem Cloudinary também funciona',
        excerpt: 'Resumo da coluna.',
        content: '<p>Corpo da coluna.</p>',
        authorId: author.id,
      })
      .expect(201);

    const published = await client
      .post(`/api/admin/posts/${post.body.data.post.id}/publish`)
      .expect(200);

    expect(published.body.data.post.status).toBe('published');
  });

  it('explains why news cannot be published yet', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();
    const category = await makeCategory();
    const { client } = await loginAs(admin.email);

    const post = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Notícia sem capa',
        excerpt: 'Resumo.',
        content: '<p>Corpo.</p>',
        categoryId: category.id,
        authorId: writer.id,
      })
      .expect(201);

    const refused = await client
      .post(`/api/admin/posts/${post.body.data.post.id}/publish`)
      .expect(422);

    expect(refused.body.error.fields).toHaveProperty('coverId');
  });
});
