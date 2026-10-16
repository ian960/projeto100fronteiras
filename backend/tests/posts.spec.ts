import { describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { agent, loginAs } from './helpers/agent';
import {
  makeAdmin,
  makeCategory,
  makeColumn,
  makeColumnist,
  makeMedia,
  makeNews,
  makeWriter,
} from './factories';
import { FAKE_CLOUDINARY } from './helpers/cloudinaryTestEnv';

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
      { excerpt: '', content: '', coverId: null },
    );

    const response = await client.post(`/api/admin/posts/${draft.id}/publish`).expect(422);

    expect(response.body.error.fields).toHaveProperty('excerpt');
    expect(response.body.error.fields).toHaveProperty('content');
    expect(response.body.error.fields).toHaveProperty('coverId');
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
        video: { provider: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s' },
      })
      .expect(201);

    // The template builds the iframe from this id — an <iframe> is never
    // accepted from the editor.
    expect(response.body.data.post.videoYoutubeId).toBe('dQw4w9WgXcQ');
    expect(response.body.data.post.video).toBeNull();
  });

  it('rejects a link that is not YouTube', async () => {
    const { writer, category, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Wrong site',
        authorId: writer.id,
        categoryId: category.id,
        video: { provider: 'youtube', url: 'https://vimeo.com/123' },
      })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('video');
  });

  it('switches from an uploaded video to YouTube, clearing the file', async () => {
    const { admin, writer, category, client } = await adminContext();
    const clip = await makeMedia(admin.id, 'video');

    const created = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Uploaded video',
        authorId: writer.id,
        categoryId: category.id,
        video: { provider: 'cloudinary', mediaId: clip.id },
      })
      .expect(201);

    // .mov or .webm, Cloudinary delivers an mp4 every browser plays.
    expect(created.body.data.post.video.url).toMatch(/\/video\/upload\/q_auto\/v\d+\/.+\.mp4$/);
    expect(created.body.data.post.video.posterUrl).toMatch(/so_0.*\.jpg$/);

    const switched = await client
      .patch(`/api/admin/posts/${created.body.data.post.id}`)
      .send({ video: { provider: 'youtube', url: 'dQw4w9WgXcQ' } })
      .expect(200);

    expect(switched.body.data.post.videoYoutubeId).toBe('dQw4w9WgXcQ');
    expect(switched.body.data.post.videoId).toBeNull();
  });

  it('refuses a file that is not a video', async () => {
    const { admin, writer, category, client } = await adminContext();
    const pdf = await makeMedia(admin.id, 'document');

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'A PDF as video',
        authorId: writer.id,
        categoryId: category.id,
        video: { provider: 'cloudinary', mediaId: pdf.id },
      })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('video');
  });

  it('never keeps both kinds at once, even past the service', async () => {
    const { admin, writer, category } = await adminContext();
    const clip = await makeMedia(admin.id, 'video');
    const post = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    // Straight into Postgres: the CHECK constraint "posts_single_video".
    await expect(
      prisma.post.update({
        where: { id: post.id },
        data: { videoYoutubeId: 'dQw4w9WgXcQ', videoId: clip.id },
      }),
    ).rejects.toThrow();
  });
});

describe('media in posts', () => {
  it('only takes an image as cover', async () => {
    const { admin, writer, category, client } = await adminContext();
    const pdf = await makeMedia(admin.id, 'document');

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'PDF as cover',
        authorId: writer.id,
        categoryId: category.id,
        coverId: pdf.id,
      })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('coverId');
  });

  it('returns the cover with ready-made responsive URLs', async () => {
    const { admin, writer, category, client } = await adminContext();
    const post = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
    await client.post(`/api/admin/posts/${post.id}/publish`).expect(200);

    const detail = await agent().get(`/api/posts/${post.slug}`).expect(200);
    const cover = detail.body.data.post.cover;

    const delivery = `${process.env.CLOUDINARY_DELIVERY_BASE}/${FAKE_CLOUDINARY.cloudName}/image/upload`;
    expect(cover.url.startsWith(delivery)).toBe(true);
    // 1600px original: every width up to 1600, in a srcset the browser picks from.
    expect(cover.srcset).toContain('w_480');
    expect(cover.srcset).toContain('1600w');
    expect(cover.url).toContain('f_auto,q_auto');

    // Listings carry the cover too, for the cards.
    const list = await agent().get('/api/posts').expect(200);
    expect(list.body.data.items[0].cover.thumbnailUrl).toContain('w_480');
  });

  it('lets a columnist use only files they uploaded', async () => {
    const admin = await makeAdmin();
    const { user, author } = await makeColumnist();
    const adminsPhoto = await makeMedia(admin.id);
    const ownPhoto = await makeMedia(user.id);
    const { client } = await loginAs(user.email);

    await client
      .post('/api/columnist/posts')
      .send({ title: 'Borrowed cover', coverId: adminsPhoto.id })
      .expect(403);

    const created = await client
      .post('/api/columnist/posts')
      .send({ title: 'Own cover', coverId: ownPhoto.id })
      .expect(201);

    expect(created.body.data.post.authorId).toBe(author.id);
    expect(created.body.data.post.cover.id).toBe(ownPhoto.id);
  });

  it('lets a columnist keep a cover the admin picked', async () => {
    const admin = await makeAdmin();
    const { user, author } = await makeColumnist();
    const adminsPhoto = await makeMedia(admin.id);
    const column = await makeColumn(
      { authorId: author.id, createdById: user.id },
      { coverId: adminsPhoto.id },
    );
    const { client } = await loginAs(user.email);

    // The panel sends every field on save, the unchanged cover included.
    await client
      .patch(`/api/columnist/posts/${column.id}`)
      .send({ title: 'New headline', coverId: adminsPhoto.id })
      .expect(200);
  });

  it('keeps PDF attachments in the order and with the titles given', async () => {
    const { admin, writer, category, client } = await adminContext();
    const notice = await makeMedia(admin.id, 'document');
    const results = await makeMedia(admin.id, 'document', { pages: 12 });

    const created = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Concurso público',
        authorId: writer.id,
        categoryId: category.id,
        attachments: [
          { mediaId: results.id, title: 'Resultado final' },
          { mediaId: notice.id, title: 'Edital completo' },
        ],
      })
      .expect(201);

    const attachments = created.body.data.post.attachments;
    expect(attachments.map((item: { title: string }) => item.title)).toEqual([
      'Resultado final',
      'Edital completo',
    ]);
    expect(attachments[0].media.pages).toBe(12);
    expect(attachments[0].media.url).toMatch(/\.pdf$/);
    expect(attachments[0].media.thumbnailUrl).toContain('pg_1');

    // The list is replaced as a whole.
    const updated = await client
      .patch(`/api/admin/posts/${created.body.data.post.id}`)
      .send({ attachments: [{ mediaId: notice.id, title: 'Edital (retificado)' }] })
      .expect(200);

    expect(updated.body.data.post.attachments).toHaveLength(1);
    expect(updated.body.data.post.attachments[0].title).toBe('Edital (retificado)');
  });

  it('attaches PDFs only', async () => {
    const { admin, writer, category, client } = await adminContext();
    const photo = await makeMedia(admin.id, 'image');

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Photo as attachment',
        authorId: writer.id,
        categoryId: category.id,
        attachments: [{ mediaId: photo.id, title: 'Foto' }],
      })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('attachments');
  });

  it('keeps the files when a post is deleted', async () => {
    const { admin, writer, category, client } = await adminContext();
    const pdf = await makeMedia(admin.id, 'document');

    const created = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'To be deleted',
        authorId: writer.id,
        categoryId: category.id,
        attachments: [{ mediaId: pdf.id, title: 'Anexo' }],
      })
      .expect(201);

    await client.delete(`/api/admin/posts/${created.body.data.post.id}`).expect(204);

    // The attachment rows went with the post; the file is still there.
    expect(await prisma.postAttachment.count()).toBe(0);
    expect(await prisma.media.findUnique({ where: { id: pdf.id } })).not.toBeNull();
  });

  it('keeps our photos inside the text and drops everyone else\'s', async () => {
    const { writer, category, client } = await adminContext();
    const ours = `${process.env.CLOUDINARY_DELIVERY_BASE}/${FAKE_CLOUDINARY.cloudName}/image/upload/v1760000000/${FAKE_CLOUDINARY.folder}/body/0b3e1c0e-0000-4000-8000-000000000001.jpg`;

    const response = await client
      .post('/api/admin/posts')
      .send({
        type: 'news',
        title: 'Photos in the text',
        authorId: writer.id,
        categoryId: category.id,
        content:
          `<p><img src="${ours}" alt="Praça cheia" onerror="alert(1)"></p>` +
          '<p><img src="https://elsewhere.example/photo.jpg"></p>',
      })
      .expect(201);

    const content: string = response.body.data.post.content;
    expect(content).toContain('alt="Praça cheia"');
    expect(content).toContain('srcset=');
    expect(content).toContain('loading="lazy"');
    expect(content).not.toContain('onerror');
    expect(content).not.toContain('elsewhere.example');
  });
});

describe('author photo', () => {
  it('turns the photo into a face-centred avatar', async () => {
    const { user, author } = await makeColumnist();
    const photo = await makeMedia(user.id);
    const { client } = await loginAs(user.email);

    await client.patch('/api/columnist/profile').send({ photoId: photo.id }).expect(200);

    const page = await agent().get(`/api/columnists/${author.slug}`).expect(200);
    expect(page.body.data.author.photoId).toBe(photo.id);
    expect(page.body.data.author.photoUrl).toContain('c_thumb,g_face');
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
