import { describe, expect, it } from 'vitest';
import { isStorageConfigured } from '../src/config/storage';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin } from './factories';

// How the API behaves with optional features switched off.
//
// The test environment leaves R2 unset on purpose (see vitest.config.mts), so
// these tests prove the API is fully usable before anyone has Cloudflare keys.
const r2Off = !isStorageConfigured();

describe('health', () => {
  it('reports which optional features are on', async () => {
    const response = await agent().get('/api/health').expect(200);

    expect(response.body.data.ok).toBe(true);
    expect(response.body.data.uploads).toBe(r2Off ? 'disabled' : 'r2');
  });
});

describe.skipIf(!r2Off)('uploads without R2', () => {
  it('answers 503 instead of crashing', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const response = await client
      .post('/api/upload/image')
      .attach('file', Buffer.from('not really an image'), 'cover.jpg')
      .expect(503);

    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('refuses the video ticket the same way', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    await client
      .post('/api/upload/video-ticket')
      .send({ filename: 'clip.mp4', contentType: 'video/mp4', sizeBytes: 1024 })
      .expect(503);
  });

  it('still checks authentication first', async () => {
    // 401, not 503: an anonymous visitor learns nothing about the server's
    // configuration.
    await agent().post('/api/upload/image').expect(401);
  });
});

describe('everything else without R2', () => {
  it('creates and publishes a post using a cover URL from anywhere', async () => {
    const admin = await makeAdmin();
    const { client } = await loginAs(admin.email);

    const category = await client
      .post('/api/admin/categories')
      .send({ name: 'Cidade' })
      .expect(201);

    const writer = await client
      .post('/api/admin/authors')
      .send({ name: 'Redação Teste' })
      .expect(201);

    const post = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Sem R2 também funciona',
        excerpt: 'Resumo da matéria.',
        content: '<p>Corpo da matéria.</p>',
        // Any public image URL works while uploads are off.
        coverUrl: 'https://picsum.photos/1280/720',
        categoryId: category.body.data.category.id,
        authorId: writer.body.data.author.id,
      })
      .expect(201);

    const published = await client
      .post(`/api/admin/posts/${post.body.data.post.id}/publish`)
      .expect(200);

    expect(published.body.data.post.status).toBe('published');
  });
});
