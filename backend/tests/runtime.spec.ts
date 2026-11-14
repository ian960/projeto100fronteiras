import { describe, expect, it } from 'vitest';
import { isMediaConfigured } from '../src/config/cloudinary';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumnist, makeWriter } from './factories';

// How the API behaves with Cloudinary switched off.
//
// This file runs in its own group ("sem-cloudinary", see
// vitest.config.mts) with CLOUDINARY_URL empty, so it proves the API is usable
// before anyone has Cloudinary keys.

describe('sem Cloudinary', () => {
  it('roda no grupo certo', () => {
    expect(isMediaConfigured()).toBe(false);
  });

  it('informa que os envios estão desligados', async () => {
    const response = await agent().get('/api/health').expect(200);

    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.uploads).toBe('disabled');
  });

  it('responde 503 em toda rota de arquivos em vez de quebrar', async () => {
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

  it('continua checando o login antes', async () => {
    // 401, not 503: an anonymous visitor learns nothing about the server's
    // configuration.
    await agent().post('/api/media/signature').send({ purpose: 'cover' }).expect(401);
  });

  it('publica coluna, que não precisa de capa', async () => {
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

  it('explica por que notícia ainda não pode ser publicada', async () => {
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
