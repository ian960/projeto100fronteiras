import { createServer, type Server } from 'node:http';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { fetchFeedOverHttp, newsImportService } from '../src/modules/newsImport/newsImport.service';
import { parseFeed, shorten, stripTags } from '../src/modules/newsImport/newsImport.feed';
import { agent, loginAs } from './helpers/agent';
import { makeAdmin, makeCategory, makeColumnist, makeNews } from './factories';
import { pngFile } from './helpers/upload';

// Stands in for the agency's photo server: /fotos/<guid>.png is a photo,
// anything else is a 404.
let photoSite: Server;
let photoBase = '';
beforeAll(async () => {
  photoSite = createServer((req, res) => {
    if (req.url?.startsWith('/fotos/') && !req.url.includes('sumiu')) {
      res.writeHead(200, { 'content-type': 'image/png' });
      return res.end(pngFile(1280, 720).bytes);
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => photoSite.listen(0, '127.0.0.1', resolve));
  photoBase = `http://127.0.0.1:${(photoSite.address() as { port: number }).port}/fotos`;
});
afterAll(() => new Promise<void>((resolve) => photoSite.close(() => resolve())));

const HOUR = 60 * 60 * 1000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toUTCString();

// Shaped like Agência Brasil's feed: the whole text, as escaped HTML, in
// <description>; the reporter in <dc:creator>; the photo in <imagem-destaque>.
function agenciaFeed(items: { guid: string; title: string; hoursAgo: number }[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Agência Brasil</title><description>As notícias podem ser reproduzidas desde que citada a fonte.</description>
${items
  .map(
    (item) => `<item>
  <title>${item.title}</title>
  <link>https://agenciabrasil.ebc.com.br/geral/noticia/${item.guid}</link>
  <description>&lt;p&gt;Primeiro parágrafo da matéria &lt;strong&gt;${item.title}&lt;/strong&gt;.&lt;/p&gt;&lt;p&gt;Segundo parágrafo.&lt;/p&gt;&lt;img src="https://imagens.ebc.com.br/foto.jpg"&gt;&lt;script&gt;alert(1)&lt;/script&gt;</description>
  <pubDate>${ago(item.hoursAgo)}</pubDate>
  <dc:creator>Maria Silva - Repórter da Agência Brasil</dc:creator>
  <guid isPermaLink="false">${item.guid}</guid>
  <imagem-destaque>${photoBase}/${item.guid}.png</imagem-destaque>
</item>`,
  )
  .join('\n')}
</channel></rss>`;
}

const atomFeed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Jornal da Fronteira</title>
  <entry>
    <id>tag:jornal,2026:1</id>
    <title>Ponte reaberta &amp; trânsito liberado</title>
    <link rel="alternate" href="https://jornal.example/ponte"/>
    <updated>${new Date(Date.now() - HOUR).toISOString()}</updated>
    <summary type="html">&lt;p&gt;A ponte foi reaberta nesta manhã.&lt;/p&gt;</summary>
    <content type="html">&lt;p&gt;Texto inteiro que não pode ser copiado.&lt;/p&gt;</content>
    <author><name>Fulano</name></author>
  </entry>
</feed>`;

let feeds: Record<string, string> = {};
newsImportService.setFetcher(async (url) => {
  const body = feeds[url];
  if (body === undefined) throw new Error('The feed answered HTTP 404.');
  return body;
});

afterEach(() => {
  feeds = {};
});

async function setup() {
  const admin = await makeAdmin();
  const category = await makeCategory();
  const { client } = await loginAs(admin.email);
  return { admin, category, client };
}

async function addSource(client: ReturnType<typeof agent>, body: Record<string, unknown>) {
  const response = await client.post('/api/admin/news-import/sources').send(body).expect(201);
  return response.body.data.source;
}

describe('leitura do feed', () => {
  it('lê RSS com o texto inteiro, o autor e a foto da Agência Brasil', () => {
    const [item] = parseFeed(agenciaFeed([{ guid: 'a1', title: 'Chuva no Sul', hoursAgo: 1 }]));
    expect(item?.guid).toBe('a1');
    expect(item?.title).toBe('Chuva no Sul');
    expect(item?.link).toBe('https://agenciabrasil.ebc.com.br/geral/noticia/a1');
    expect(item?.summaryHtml).toContain('<strong>Chuva no Sul</strong>');
    expect(item?.author).toBe('Maria Silva - Repórter da Agência Brasil');
    expect(item?.imageUrl).toBe(`${photoBase}/a1.png`);
    expect(item?.publishedAt).toBeInstanceOf(Date);
  });

  it('lê Atom', () => {
    const [item] = parseFeed(atomFeed);
    expect(item?.title).toBe('Ponte reaberta & trânsito liberado');
    expect(item?.link).toBe('https://jornal.example/ponte');
    expect(item?.author).toBe('Fulano');
  });

  it('o resumo separa os parágrafos', () => {
    expect(stripTags('<p>Um.</p><p>Dois &amp; três.</p>')).toBe('Um. Dois & três.');
    expect(shorten('palavra '.repeat(10).trim(), 30)).toBe('palavra palavra palavra…');
  });

  it('recusa uma página que não é feed', () => {
    expect(() => parseFeed('<html><body>oi</body></html>')).toThrow();
  });

  it('o leitor HTTP só aceita respostas 2xx', async () => {
    await expect(fetchFeedOverHttp('http://127.0.0.1:9/nada')).rejects.toThrow();
  });
});

describe('importar notícias', () => {
  it('só o admin mexe nas fontes', async () => {
    const { user } = await makeColumnist();
    const { client } = await loginAs(user.email);
    await client.get('/api/admin/news-import/sources').expect(403);
    await agent().get('/api/admin/news-import/sources').expect(401);
  });

  it('cria rascunhos com o texto inteiro, a fonte e o repórter, sem nunca publicar', async () => {
    const { client, category, admin } = await setup();
    const feedUrl = 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml';
    feeds[feedUrl] = agenciaFeed([
      { guid: 'a1', title: 'Chuva no Sul', hoursAgo: 1 },
      { guid: 'a2', title: 'Vacinação em Foz', hoursAgo: 2 },
    ]);
    const source = await addSource(client, { name: 'Agência Brasil', feedUrl, fullText: true, categoryId: category.id });

    const run = await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    expect(run.body.data.results[0]).toMatchObject({ imported: 2, error: null });

    const posts = await prisma.post.findMany({ orderBy: { createdAt: 'asc' } });
    expect(posts).toHaveLength(2);
    for (const post of posts) {
      // Waiting in Revisão, never published by the robot.
      expect(post.status).toBe('pending');
      expect(post.type).toBe('news');
      expect(post.categoryId).toBe(category.id);
      expect(post.sourceName).toBe('Agência Brasil');
      expect(post.bylineName).toBe('Maria Silva - Repórter da Agência Brasil');
      expect(post.createdById).toBe(admin.id);
      expect(post.content).toContain('Segundo parágrafo.');
      expect(post.content).not.toContain('script');
      expect(post.content).not.toContain('<img');
    }
    expect(posts.map((p) => p.sourceUrl)).toContain('https://agenciabrasil.ebc.com.br/geral/noticia/a1');

    // The source's photo became the cover, copied to Cloudinary by the admin.
    for (const post of posts) {
      expect(post.coverId).not.toBeNull();
      expect(post.coverAlt).toBe(post.title);
      const cover = await prisma.media.findUniqueOrThrow({ where: { id: post.coverId! } });
      expect(cover.uploadedById).toBe(admin.id);
      expect(cover.width).toBe(1280);
    }

    const origin = await client.get(`/api/admin/news-import/posts/${posts[0]!.id}`).expect(200);
    expect(origin.body.data.origin).toMatchObject({ sourceName: 'Agência Brasil', fullText: true });
    expect(origin.body.data.origin.imageUrl).toMatch(/\/fotos\/a[12]\.png$/);

    const items = await client.get('/api/admin/news-import/items').expect(200);
    expect(items.body.data.items).toHaveLength(2);
    expect(items.body.data.items[0].post.status).toBe('pending');
  });

  it('se a foto não puder ser copiada, o rascunho entra sem capa e o editor oferece a foto', async () => {
    const { client, category } = await setup();
    const feedUrl = 'https://agenciabrasil.ebc.com.br/feed.xml';
    feeds[feedUrl] = agenciaFeed([{ guid: 'sumiu', title: 'Foto que sumiu', hoursAgo: 1 }]);
    const source = await addSource(client, { name: 'Agência Brasil', feedUrl, fullText: true, categoryId: category.id });

    const run = await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    expect(run.body.data.results[0]).toMatchObject({ imported: 1, error: null });

    const post = await prisma.post.findFirstOrThrow();
    expect(post.coverId).toBeNull();
    const origin = await client.get(`/api/admin/news-import/posts/${post.id}`).expect(200);
    expect(origin.body.data.origin.imageUrl).toMatch(/\/fotos\/sumiu\.png$/);
  });

  it('de fonte sem permissão de cópia traz só o resumo e o link', async () => {
    const { client, category } = await setup();
    const feedUrl = 'https://jornal.example/feed';
    feeds[feedUrl] = atomFeed;
    await addSource(client, { name: 'Jornal da Fronteira', feedUrl, categoryId: category.id });

    await client.post('/api/admin/news-import/run').expect(200);

    const post = await prisma.post.findFirstOrThrow();
    expect(post.content).toContain('A ponte foi reaberta nesta manhã.');
    expect(post.content).toContain('href="https://jornal.example/ponte"');
    expect(post.content).not.toContain('Texto inteiro');
    expect(post.bylineName).toBeNull();
    expect(post.excerpt).toBe('A ponte foi reaberta nesta manhã.');
    expect((await prisma.post.count())).toBe(1);
  });

  it('não importa a mesma notícia duas vezes, nem depois de apagar o rascunho', async () => {
    const { client, category } = await setup();
    const feedUrl = 'https://agenciabrasil.ebc.com.br/feed.xml';
    feeds[feedUrl] = agenciaFeed([{ guid: 'a1', title: 'Chuva no Sul', hoursAgo: 1 }]);
    const source = await addSource(client, { name: 'Agência Brasil', feedUrl, fullText: true, categoryId: category.id });

    await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    await prisma.post.deleteMany();
    const again = await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    expect(again.body.data.results[0].imported).toBe(0);
    expect(await prisma.post.count()).toBe(0);
  });

  it('ignora notícias velhas e, na primeira vez, traz só as 3 mais novas', async () => {
    const { client, category } = await setup();
    const feedUrl = 'https://agenciabrasil.ebc.com.br/feed.xml';
    feeds[feedUrl] = agenciaFeed([
      { guid: 'n1', title: 'Notícia um', hoursAgo: 1 },
      { guid: 'n2', title: 'Notícia dois', hoursAgo: 2 },
      { guid: 'n3', title: 'Notícia três', hoursAgo: 3 },
      { guid: 'n4', title: 'Notícia quatro', hoursAgo: 4 },
      { guid: 'old', title: 'Notícia velha', hoursAgo: 24 * 8 },
      { guid: 'week', title: 'Notícia de anteontem', hoursAgo: 60 },
    ]);
    const source = await addSource(client, { name: 'Agência Brasil', feedUrl, fullText: true, categoryId: category.id });

    await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    const titles = (await prisma.post.findMany()).map((p) => p.title).sort();
    expect(titles).toEqual(['Notícia dois', 'Notícia três', 'Notícia um']);

    // The rest was marked as seen on the first run: it does not show up later.
    const later = await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    // The answer says why: what the feed has and how recent it is.
    expect(later.body.data.results[0]).toMatchObject({ imported: 0, found: 6 });
    expect(new Date(later.body.data.results[0].newestAt).getTime()).toBeGreaterThan(Date.now() - 2 * HOUR);
  });

  it('a busca automática só lê as fontes ativas e anota o erro de cada fonte', async () => {
    const { client, category } = await setup();
    const ok = await addSource(client, { name: 'Boa', feedUrl: 'https://boa.example/feed', fullText: false, categoryId: category.id });
    const broken = await addSource(client, { name: 'Quebrada', feedUrl: 'https://quebrada.example/feed', categoryId: category.id });
    const off = await addSource(client, { name: 'Desligada', feedUrl: 'https://off.example/feed', categoryId: category.id, active: false });
    feeds['https://boa.example/feed'] = atomFeed;
    feeds['https://off.example/feed'] = atomFeed;

    const results = await newsImportService.runAll();
    expect(results.map((r) => r.name)).toEqual(['Boa', 'Quebrada']);

    const list = await client.get('/api/admin/news-import/sources').expect(200);
    const byId = Object.fromEntries(list.body.data.sources.map((s: { id: string }) => [s.id, s]));
    expect(byId[ok.id]).toMatchObject({ lastImportedCount: 1, lastError: null });
    expect(byId[broken.id].lastError).toContain('404');
    expect(byId[off.id].lastRunAt).toBeNull();
  });

  it('não deixa cadastrar o mesmo feed duas vezes nem sem categoria', async () => {
    const { client, category } = await setup();
    const body = { name: 'Agência Senado', feedUrl: 'https://www12.senado.leg.br/feed', categoryId: category.id };
    await addSource(client, body);
    await client.post('/api/admin/news-import/sources').send(body).expect(409);
    await client.post('/api/admin/news-import/sources').send({ ...body, feedUrl: 'https://x.example/f', categoryId: undefined }).expect(422);
    await client.post('/api/admin/news-import/sources').send({ ...body, feedUrl: 'javascript:alert(1)' }).expect(422);
  });

  it('apagar a categoria deixa a fonte esperando outra; apagar a fonte mantém os rascunhos', async () => {
    const { client, category } = await setup();
    const feedUrl = 'https://jornal.example/feed';
    feeds[feedUrl] = atomFeed;
    const source = await addSource(client, { name: 'Jornal', feedUrl, categoryId: category.id });
    await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);

    await client.delete(`/api/admin/news-import/sources/${source.id}`).expect(204);
    expect(await prisma.post.count()).toBe(1);

    const other = await makeCategory();
    const second = await addSource(client, { name: 'Jornal', feedUrl, categoryId: other.id });
    await prisma.category.delete({ where: { id: other.id } });
    const run = await client.post(`/api/admin/news-import/sources/${second.id}/run`).expect(200);
    expect(run.body.data.results[0].error).toContain('category');
  });

  it('excluir todas apaga só as automáticas em revisão, e elas não voltam', async () => {
    const { client, category } = await setup();
    const feedUrl = 'https://agenciabrasil.ebc.com.br/feed.xml';
    feeds[feedUrl] = agenciaFeed([
      { guid: 'x1', title: 'Primeira', hoursAgo: 1 },
      { guid: 'x2', title: 'Segunda', hoursAgo: 2 },
      { guid: 'x3', title: 'Terceira', hoursAgo: 3 },
    ]);
    const source = await addSource(client, { name: 'Agência Brasil', feedUrl, fullText: true, categoryId: category.id });
    await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    const imported = await prisma.post.findMany({ select: { id: true } });
    expect(imported).toHaveLength(3);
    // One imported news was already published: it stays.
    await prisma.post.update({ where: { id: imported[0]!.id }, data: { status: 'published', publishedAt: new Date() } });

    // A columnist's news waiting in Revisão stays too.
    const { user, author } = await makeColumnist();
    const manual = await makeNews({ authorId: author.id, createdById: user.id, categoryId: category.id }, { status: 'pending' });

    const { client: columnistClient } = await loginAs(user.email);
    await columnistClient.post('/api/admin/news-import/pending/delete').expect(403);

    const response = await client.post('/api/admin/news-import/pending/delete').expect(200);
    expect(response.body.data.deleted).toBe(2);
    const left = await prisma.post.findMany({ select: { id: true } });
    expect(left.map((p) => p.id).sort()).toEqual([imported[0]!.id, manual.id].sort());

    const again = await client.post(`/api/admin/news-import/sources/${source.id}/run`).expect(200);
    expect(again.body.data.results[0].imported).toBe(0);
    expect((await client.post('/api/admin/news-import/pending/delete').expect(200)).body.data.deleted).toBe(0);
  });
});
