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

describe('notícias e editorias', () => {
  it('recusa notícia sem editoria', async () => {
    const { writer, client } = await adminContext();

    const response = await client
      .post('/api/admin/posts')
      .send({ type: 'news', title: 'Missing category', authorId: writer.id })
      .expect(422);

    expect(response.body.error.fields).toHaveProperty('categoryId');
  });

  it('recusa coluna com editoria', async () => {
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

  it('garante a regra no banco também', async () => {
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

describe('publicar', () => {
  it('recusa publicar matéria incompleta', async () => {
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

  it('trata como vazio o texto vazio do editor', async () => {
    const { admin, writer, category, client } = await adminContext();

    const draft = await makeNews(
      { authorId: writer.id, createdById: admin.id, categoryId: category.id },
      // What Quill produces for an untouched editor.
      { content: '<p><br></p>' },
    );

    const response = await client.post(`/api/admin/posts/${draft.id}/publish`).expect(422);
    expect(response.body.error.fields).toHaveProperty('content');
  });

  it('registra quem publicou e quando', async () => {
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

  it('esconde rascunhos da lista pública', async () => {
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

  it('responde 404 para rascunho buscado pelo endereço', async () => {
    const { admin, writer, category } = await adminContext();

    const draft = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await agent().get(`/api/posts/${draft.slug}`).expect(404);
  });
});

describe('carrossel da página inicial', () => {
  it('mostra todos os destaques, o mais recente primeiro', async () => {
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

    const featured = await prisma.post.findMany({ where: { featured: true } });
    expect(featured).toHaveLength(2);

    const home = await agent().get('/api/home').expect(200);
    expect(home.body.data.highlights.map((post: { id: string }) => post.id)).toEqual([second.id, first.id]);
    expect(home.body.data.featured.id).toBe(second.id);

    // Featuring again moves it to the front.
    await client.post(`/api/admin/posts/${first.id}/feature`).expect(200);
    const again = await agent().get('/api/home').expect(200);
    expect(again.body.data.highlights[0].id).toBe(first.id);
  });

  it('completa até quatro com as últimas notícias, sem repetir', async () => {
    const { admin, writer, category, client } = await adminContext();

    const posts = [];
    for (let i = 0; i < 6; i += 1) {
      const news = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
      await client.post(`/api/admin/posts/${news.id}/publish`).expect(200);
      posts.push(news);
    }

    // The oldest one is featured: it leads, then the three most recent follow.
    await client.post(`/api/admin/posts/${posts[0]!.id}/feature`).expect(200);

    const home = await agent().get('/api/home').expect(200);
    const ids: string[] = home.body.data.highlights.map((post: { id: string }) => post.id);

    expect(ids).toHaveLength(4);
    expect(ids[0]).toBe(posts[0]!.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('mostra mais de quatro quando o admin destaca mais', async () => {
    const { admin, writer, category, client } = await adminContext();

    for (let i = 0; i < 5; i += 1) {
      const news = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
      await client.post(`/api/admin/posts/${news.id}/publish`).expect(200);
      await client.post(`/api/admin/posts/${news.id}/feature`).expect(200);
    }

    const home = await agent().get('/api/home').expect(200);
    expect(home.body.data.highlights).toHaveLength(5);
  });

  it('tira uma matéria do carrossel, e despublicar também tira', async () => {
    const { admin, writer, category, client } = await adminContext();

    const first = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
    const second = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
    for (const news of [first, second]) {
      await client.post(`/api/admin/posts/${news.id}/publish`).expect(200);
      await client.post(`/api/admin/posts/${news.id}/feature`).expect(200);
    }

    await client.delete(`/api/admin/posts/${first.id}/feature`).expect(200);
    await client.post(`/api/admin/posts/${second.id}/unpublish`).expect(200);

    const featured = await prisma.post.findMany({ where: { featured: true } });
    expect(featured).toHaveLength(0);
  });

  it('só o admin escolhe', async () => {
    const { admin, writer, category, client } = await adminContext();
    const news = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
    await client.post(`/api/admin/posts/${news.id}/publish`).expect(200);

    const { user: columnistUser } = await makeColumnist();
    const { client: columnist } = await loginAs(columnistUser.email);
    const response = await columnist.post(`/api/admin/posts/${news.id}/feature`);
    expect(response.status).toBe(403);
  });

  it('recusa destacar rascunho', async () => {
    const { admin, writer, category, client } = await adminContext();

    const draft = await makeNews({
      authorId: writer.id,
      createdById: admin.id,
      categoryId: category.id,
    });

    await client.post(`/api/admin/posts/${draft.id}/feature`).expect(409);
  });
});

describe('lista do painel', () => {
  it('mostra quantos comentários cada matéria tem, sem contar os apagados', async () => {
    const { admin, writer, category, client } = await adminContext();

    const news = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });
    const quiet = await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    await prisma.comment.createMany({
      data: [
        { postId: news.id, userId: admin.id, content: 'Um' },
        { postId: news.id, userId: admin.id, content: 'Dois' },
        { postId: news.id, userId: admin.id, content: '', deletedAt: new Date() },
      ],
    });

    const response = await client.get('/api/admin/posts').expect(200);
    const byId = new Map(response.body.data.items.map((post: { id: string; commentCount: number }) => [post.id, post.commentCount]));

    expect(byId.get(news.id)).toBe(2);
    expect(byId.get(quiet.id)).toBe(0);
  });
});

describe('limpeza do HTML', () => {
  it('tira scripts e eventos do texto', async () => {
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

  it('mantém a formatação que o editor pode produzir', async () => {
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

  it('põe rel=noopener nos links', async () => {
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

describe('vídeo', () => {
  it('guarda só o id do link do YouTube', async () => {
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

  it('recusa link que não é do YouTube', async () => {
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

  it('troca vídeo enviado por YouTube e solta o arquivo', async () => {
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

  it('recusa arquivo que não é vídeo', async () => {
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

  it('nunca guarda os dois tipos juntos, nem passando por fora do serviço', async () => {
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

describe('arquivos nas matérias', () => {
  it('só aceita imagem como capa', async () => {
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

  it('devolve a capa com os endereços prontos para cada tamanho', async () => {
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

  it('deixa o colunista usar só os arquivos que ele enviou', async () => {
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

  it('deixa o colunista manter uma capa escolhida pelo admin', async () => {
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

  it('mantém os PDFs na ordem e com os títulos dados', async () => {
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

  it('só anexa PDF', async () => {
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

  it('mantém os arquivos quando a matéria é excluída', async () => {
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

  it('mantém nossas fotos dentro do texto e descarta as de outros sites', async () => {
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

describe('foto do autor', () => {
  it('transforma a foto num avatar centrado no rosto', async () => {
    const { user, author } = await makeColumnist();
    const photo = await makeMedia(user.id);
    const { client } = await loginAs(user.email);

    await client.patch('/api/columnist/profile').send({ photoId: photo.id }).expect(200);

    const page = await agent().get(`/api/columnists/${author.slug}`).expect(200);
    expect(page.body.data.author.photoId).toBe(photo.id);
    expect(page.body.data.author.photoUrl).toContain('c_thumb,g_face');
  });
});

describe('endereços repetidos', () => {
  it('acrescenta um número a um título repetido em vez de falhar', async () => {
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

describe('salvos do leitor', () => {
  it('resolve os salvos numa requisição só, apenas os publicados', async () => {
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

describe('dados da página inicial', () => {
  it('devolve a manchete e as últimas de cada tipo', async () => {
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
    // One block per category that has news; empty categories are left out.
    expect(response.body.data.sections).toEqual([
      { category: { id: category.id, name: category.name, slug: category.slug }, posts: [expect.objectContaining({ id: news.id })] },
    ]);
  });

  it('deixa de fora editorias sem notícia publicada', async () => {
    const { admin, writer, category } = await adminContext();
    await makeCategory();
    await makeNews({ authorId: writer.id, createdById: admin.id, categoryId: category.id });

    const response = await agent().get('/api/home').expect(200);

    expect(response.body.data.sections).toEqual([]);
  });
});

describe('leia também', () => {
  // Published straight in the database, with a date each, so the order is known.
  async function publishedNews(
    ctx: { admin: { id: string }; writer: { id: string } },
    categoryId: string,
    daysAgo: number,
  ) {
    return makeNews(
      { authorId: ctx.writer.id, createdById: ctx.admin.id, categoryId },
      { status: 'published', publishedAt: new Date(Date.now() - daysAgo * 86_400_000) },
    );
  }

  it('traz a mesma editoria primeiro, sem a própria matéria e sem rascunho', async () => {
    const ctx = await adminContext();
    const other = await makeCategory();

    const current = await publishedNews(ctx, ctx.category.id, 0);
    const sameOld = await publishedNews(ctx, ctx.category.id, 5);
    const sameNew = await publishedNews(ctx, ctx.category.id, 3);
    // Newer than both, but from another category: it comes after them.
    const otherNewest = await publishedNews(ctx, other.id, 1);
    await makeNews({ authorId: ctx.writer.id, createdById: ctx.admin.id, categoryId: ctx.category.id });

    const response = await agent().get(`/api/posts/${current.slug}/related`).expect(200);
    const ids = (response.body.data.posts as { id: string }[]).map((post) => post.id);

    expect(ids).toEqual([sameNew.id, sameOld.id, otherNewest.id]);
    // List shape: no article body.
    expect(response.body.data.posts[0]).not.toHaveProperty('content');
  });

  it('respeita o limite', async () => {
    const ctx = await adminContext();
    const current = await publishedNews(ctx, ctx.category.id, 0);
    for (const days of [1, 2, 3, 4, 5]) await publishedNews(ctx, ctx.category.id, days);

    const byDefault = await agent().get(`/api/posts/${current.slug}/related`).expect(200);
    expect(byDefault.body.data.posts).toHaveLength(4);

    const two = await agent().get(`/api/posts/${current.slug}/related?limit=2`).expect(200);
    expect(two.body.data.posts).toHaveLength(2);

    await agent().get(`/api/posts/${current.slug}/related?limit=50`).expect(422);
  });

  it('coluna traz primeiro o mesmo colunista', async () => {
    const ctx = await adminContext();
    const { user, author } = await makeColumnist();
    const published = { status: 'published', publishedAt: new Date() };

    const current = await makeColumn({ authorId: author.id, createdById: user.id }, published);
    const mine = await makeColumn(
      { authorId: author.id, createdById: user.id },
      { status: 'published', publishedAt: new Date(Date.now() - 5 * 86_400_000) },
    );
    const news = await publishedNews(ctx, ctx.category.id, 1);

    const response = await agent().get(`/api/posts/${current.slug}/related`).expect(200);
    const ids = (response.body.data.posts as { id: string }[]).map((post) => post.id);

    expect(ids).toEqual([mine.id, news.id]);
  });

  it('responde 404 para rascunho', async () => {
    const ctx = await adminContext();
    const draft = await makeNews({ authorId: ctx.writer.id, createdById: ctx.admin.id, categoryId: ctx.category.id });

    await agent().get(`/api/posts/${draft.slug}/related`).expect(404);
  });
});
