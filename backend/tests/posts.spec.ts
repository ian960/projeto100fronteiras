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

describe('news and categories', () => {
  it('refuses news without a category', async () => {
    const { writer, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Missing category', authorId: writer.id })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('categoryId');
  });

  it('refuses a column that carries a category', async () => {
    const { category, client } = await adminContext();
    const { author } = await makeColumnist();

    await client
      .post('/api/admin/posts')
      .send({
        type: 'column',
        title: 'Column with a category',
        authorId: author.id,
        categoryId: category.id,
      })
      .expect(422);
  });

  it('enforces the rule in the database too', async () => {
    const admin = await makeAdmin();
    const writer = await makeWriter();

    // Straight past the service, into Postgres. The CHECK constraint added by
    // hand in the migration is what refuses this.
    await expect(
      prisma.post.create({
        data: {
          type: 'news',
          title: 'Bypassing the service',
          slug: 'bypassing-the-service',
          authorId: writer.id,
          createdById: admin.id,
          // No categoryId.
        },
      }),
    ).rejects.toThrow();
  });
});

describe('publishing', () => {
  it('refuses to publish an incomplete post', async () => {
    const { admin, writer, category, client } = await adminContext();

    const draft = await makeNews(
      { authorId: writer.id, createdById: admin.id, categoryId: category.id },
      { excerpt: '', content: '', coverUrl: null },
    );

    const response = await client.post(`/api/admin/posts/${draft.id}/publish`).expect(422);

    expect(response.body.error.fields).toHaveProperty('excerpt');
    expect(response.body.error.fields).toHaveProperty('content');
    expect(response.body.error.fields).toHaveProperty('coverUrl');
  });

  it('treats an empty Quill body as empty', async () => {
    const { admin, writer, category, client } = await adminContext();

    const draft = await makeNews(
      { authorId: writer.id, createdById: admin.id, categoryId: category.id },
      // What Quill produces for an untouched editor.
      { content: '<p><br></p>' },
    );

    const response = await client.post(`/api/admin/posts/${draft.id}/publish`).expect(422);
    expect(response.body.error.fields).toHaveProperty('content');
  });

  it('records who published and when', async () => {
    const { admin, writer, category, client } = await adminContext();

    const draft = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    const response = await client.post(`/api/admin/posts/${draft.id}/publish`).expect(200);

    expect(response.body.data.post.status).toBe('published');
    expect(response.body.data.post.publishedAt).not.toBeNull();

    const stored = await prisma.post.findUnique({ where: { id: draft.id } });
    expect(stored?.publishedById).toBe(admin.id);
  });

  it('hides drafts from the public listing', async () => {
    const { admin, writer, category, client } = await adminContext();

    await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    const published = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await client.post(`/api/admin/posts/${published.id}/publish`).expect(200);

    const response = await agent().get('/api/posts').expect(200);
    const items = response.body.data.items as { id: string }[];

    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(published.id);
  });

  it('returns 404 for a draft fetched by slug', async () => {
    const { admin, writer, category } = await adminContext();

    const draft = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await agent().get(`/api/posts/${draft.slug}`).expect(404);
  });
});

describe('featured post', () => {
  it('only ever keeps one', async () => {
    const { admin, writer, category, client } = await adminContext();

    const first = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    const second = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await client.post(`/api/admin/posts/${first.id}/publish`).expect(200);
    await client.post(`/api/admin/posts/${second.id}/publish`).expect(200);

    await client.post(`/api/admin/posts/${first.id}/feature`).expect(200);
    await client.post(`/api/admin/posts/${second.id}/feature`).expect(200);

    // A partial unique index in Postgres makes two impossible; the repository
    // clears the old flag and sets the new one in one transaction.
    const featured = await prisma.post.findMany({ where: { featured: true } });

    expect(featured).toHaveLength(1);
    expect(featured[0]?.id).toBe(second.id);
  });

  it('refuses to feature a draft', async () => {
    const { admin, writer, category, client } = await adminContext();

    const draft = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await client.post(`/api/admin/posts/${draft.id}/feature`).expect(409);
  });
});

describe('html sanitizing', () => {
  it('strips script tags and event handlers from the body', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Pasted from Word',
        authorId: writer.id,
        categoryId: category.id,
        content:
          '<p>Real text</p><script>fetch("/api/admin/users")</script>' +
          '<p onclick="steal()">Handler</p><iframe src="https://evil.test"></iframe>',
      })
      .expect(201);

    const content = response.body.data.post.content as string;

    // Without this, a columnist could store a script that runs in the admin's
    // browser the moment they open the post for review.
    expect(content).not.toContain('<script');
    expect(content).not.toContain('onclick');
    expect(content).not.toContain('<iframe');
    expect(content).toContain('Real text');
  });

  it('keeps the formatting the editor is allowed to produce', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Formatting survives',
        authorId: writer.id,
        categoryId: category.id,
        content: '<p><strong>Bold</strong> and <em>italic</em></p><ul><li>Item</li></ul>',
      })
      .expect(201);

    const content = response.body.data.post.content as string;

    expect(content).toContain('<strong>Bold</strong>');
    expect(content).toContain('<li>Item</li>');
  });

  it('adds rel=noopener to links', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'External link',
        authorId: writer.id,
        categoryId: category.id,
        content: '<p><a href="https://example.com">Source</a></p>',
      })
      .expect(201);

    expect(response.body.data.post.content).toContain('rel="noopener noreferrer"');
  });
});

describe('video', () => {
  it('stores only the id from a YouTube url', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'With a video',
        authorId: writer.id,
        categoryId: category.id,
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s',
        videoProvider: 'youtube',
      })
      .expect(201);

    // The template builds the iframe from this id — an <iframe> is never
    // accepted from the editor.
    expect(response.body.data.post.videoUrl).toBe('dQw4w9WgXcQ');
  });

  it('rejects a url without a provider', async () => {
    const { writer, category, client } = await adminContext();

    await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Half a video',
        authorId: writer.id,
        categoryId: category.id,
        videoUrl: 'https://youtu.be/dQw4w9WgXcQ',
      })
      .expect(422);
  });

  it('rejects a non-mp4 uploaded video', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'iPhone recording',
        authorId: writer.id,
        categoryId: category.id,
        // .mov/HEVC is what a phone produces and what most browsers cannot
        // play. Accepting it would publish a black rectangle.
        videoUrl: 'https://cdn.test.local/videos/clip.mov',
        videoProvider: 'r2',
      })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('videoUrl');
  });
});

describe('slug collisions', () => {
  it('suffixes a repeated headline instead of failing', async () => {
    const { writer, category, client } = await adminContext();

    const first = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Chuva forte atinge a cidade', authorId: writer.id, categoryId: category.id })
      .expect(201);

    const second = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Chuva forte atinge a cidade', authorId: writer.id, categoryId: category.id })
      .expect(201);

    expect(first.body.data.post.slug).toBe('chuva-forte-atinge-a-cidade');
    // The same headline happens every summer; a 409 the writer cannot resolve
    // would be the wrong answer.
    expect(second.body.data.post.slug).toBe('chuva-forte-atinge-a-cidade-2');
  });
});

describe('reader bookmarks', () => {
  it('resolves saved ids in one request, published only', async () => {
    const { admin, writer, category, client } = await adminContext();

    const published = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    const draft = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await client.post(`/api/admin/posts/${published.id}/publish`).expect(200);

    // Bookmarks live in the browser's localStorage, so the front end holds the
    // ids and asks for them together.
    const response = await agent()
      .get(`/api/posts/by-ids?ids=${published.id},${draft.id}`)
      .expect(200);

    const posts = response.body.data.posts as { id: string }[];

    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe(published.id);
  });
});

describe('home payload', () => {
  it('returns the lead story and the latest of each type', async () => {
    const { admin, writer, category, client } = await adminContext();
    const { user: columnistUser, author } = await makeColumnist();

    const news = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    const column = await makeColumn({ authorId: author.id, createdById: columnistUser.id });

    await client.post(`/api/admin/posts/${news.id}/publish`).expect(200);
    await client.post(`/api/admin/posts/${column.id}/publish`).expect(200);
    await client.post(`/api/admin/posts/${news.id}/feature`).expect(200);

    const response = await agent().get('/api/home').expect(200);

    expect(response.body.data.featured.id).toBe(news.id);
    expect(response.body.data.latestNews).toHaveLength(1);
    expect(response.body.data.latestColumns).toHaveLength(1);
  });
});
