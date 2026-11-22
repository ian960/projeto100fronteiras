// What Google, WhatsApp and Facebook read. The site is a single-page app:
// index.html arrives empty and React draws the page in the browser. Robots
// that run no JavaScript (WhatsApp, Facebook) would see nothing, and Google
// takes longer and sometimes skips it. So for these addresses the Worker
// writes into index.html, before it leaves:
//
//   /noticia/:slug, /coluna/:slug   title, description, Open Graph, canonical,
//                                   NewsArticle structured data and the
//                                   article itself inside <div id="root">
//   /categoria/:slug, /autor/:slug  title, description, canonical and the
//                                   list of the latest articles
//   /privacidade, /termos,          title, description, canonical and the
//   /contato                        whole text (src/site/legal.ts)
//   /sitemap.xml                    every public address
//   /sitemap-news.xml               the Google News sitemap (last 48 hours)
//   /robots.txt                     what robots may read, and where the
//                                   sitemaps are
//
// React replaces the content of #root as soon as it loads, so the reader sees
// the normal page. If the API fails, the plain index.html goes out: the page
// still opens, only without these extras.

import { CONTACT, CONTACT_EMAIL, PRIVACY, TERMS, UPDATED_AT, pieces, type LegalPage } from '../src/site/legal';

// The built files (dist/). On Cloudflare it is the ASSETS binding; on Render
// the API serves them (backend/src/site/site.ts). Only fetch is used.
export interface Assets {
  fetch(request: Request): Promise<Response>;
}

export interface SeoEnv {
  ASSETS: Assets;
  // The site's public address, without a trailing slash, e.g.
  // https://portal100fronteiras.com.br. Empty: the address the page was
  // opened at. Set in wrangler.jsonc.
  SITE_URL?: string;
}

// Calls the API through the same path as the site's own requests (index.ts).
export type ApiFetch = (path: string, timeoutMs: number) => Promise<Response>;

export const SITE_NAME = 'Portal100Fronteiras';
const SITE_DESCRIPTION = 'Portal100Fronteiras: notícias, opinião e colunistas.';
const LANGUAGE = 'pt-BR';
const TIME_ZONE = 'America/Sao_Paulo';

// An article page waits at most this long for the API before going out plain.
const PAGE_TIMEOUT_MS = 8_000;
// A sitemap can wait longer: robots are patient, readers are not.
const SITEMAP_TIMEOUT_MS = 20_000;
// How long one Worker instance reuses the sitemap before asking again.
const SITEMAP_TTL_MS = 5 * 60_000;
// Google News only wants articles from the last two days.
const NEWS_WINDOW_MS = 48 * 60 * 60_000;

// ── addresses ───────────────────────────────────────────────────────────────

export function siteOrigin(env: SeoEnv, request: Request): string {
  const configured = env.SITE_URL?.trim().replace(/\/+$/, '');
  return configured || new URL(request.url).origin;
}

const PATH_OF_TYPE = { news: 'noticia', column: 'coluna' } as const;
type PostType = keyof typeof PATH_OF_TYPE;

function postPath(type: PostType, slug: string): string {
  return `/${PATH_OF_TYPE[type]}/${slug}`;
}

// ── escaping ────────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const escapeXml = escapeHtml;

// Inside <script>, a "</script>" in a title would end the tag early.
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LANGUAGE, { timeZone: TIME_ZONE, day: 'numeric', month: 'long', year: 'numeric' });
}

// ── talking to the API ──────────────────────────────────────────────────────

type ApiResult<T> = { status: 'ok'; data: T } | { status: 'missing' } | { status: 'failed' };

async function apiGet<T>(api: ApiFetch, path: string, timeoutMs: number): Promise<ApiResult<T>> {
  try {
    const response = await api(path, timeoutMs);
    if (response.status === 404) return { status: 'missing' };
    if (!response.ok) return { status: 'failed' };
    return { status: 'ok', data: ((await response.json()) as { data: T }).data };
  } catch {
    // Down, asleep or too slow.
    return { status: 'failed' };
  }
}

// ── the HTML page ───────────────────────────────────────────────────────────

type PageMeta = {
  status?: number;
  title: string;
  description: string;
  canonical: string;
  ogType: 'article' | 'website' | 'profile';
  image?: { url: string; width?: number; height?: number; alt?: string } | null;
  extraMeta?: Array<[attribute: 'name' | 'property', key: string, value: string]>;
  jsonLd?: unknown;
  rootHtml?: string;
  noindex?: boolean;
};

async function renderPage(request: Request, env: SeoEnv, meta: PageMeta): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));
  if (!page.ok) return page;

  const tags: Array<[string, string, string]> = [
    ['name', 'description', meta.description],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:locale', 'pt_BR'],
    ['property', 'og:type', meta.ogType],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:url', meta.canonical],
    ['name', 'twitter:card', meta.image ? 'summary_large_image' : 'summary'],
  ];
  if (meta.image) {
    tags.push(['property', 'og:image', meta.image.url]);
    if (meta.image.width) tags.push(['property', 'og:image:width', String(meta.image.width)]);
    if (meta.image.height) tags.push(['property', 'og:image:height', String(meta.image.height)]);
    if (meta.image.alt) tags.push(['property', 'og:image:alt', meta.image.alt]);
  }
  tags.push(...(meta.extraMeta ?? []));
  tags.push(['name', 'robots', meta.noindex ? 'noindex' : 'max-image-preview:large']);

  let head = tags.map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeHtml(value)}" />`).join('');
  if (!meta.noindex) head += `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`;
  if (meta.jsonLd) head += `<script type="application/ld+json">${jsonForScript(meta.jsonLd)}</script>`;

  // Plain text edits on our own index.html (the same file on Cloudflare and
  // on Render), so this runs anywhere: no HTMLRewriter, which only Cloudflare
  // has.
  let html = await page.text();
  // Functions as replacements: a "$&" in a title must stay text.
  const title = `<title>${escapeHtml(`${meta.title} | ${SITE_NAME}`)}</title>`;
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => title);
  // The generic tags from index.html, replaced by this page's own.
  html = html.replace(
    /<meta\s+(?:name="(?:description|robots|twitter:[^"]*)"|property="og:[^"]*")[^>]*>\s*|<link\s+rel="canonical"[^>]*>\s*/g,
    '',
  );
  html = html.replace('</head>', () => `${head}</head>`);
  if (meta.rootHtml) {
    const rootHtml = meta.rootHtml;
    html = html.replace(/<div id="root">[\s\S]*?<\/div>/, () => `<div id="root">${rootHtml}</div>`);
  }

  // Same headers as every other page (public/_headers): this response is
  // built here, so Cloudflare does not add them by itself.
  const headers = new Headers(page.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'no-cache');
  // The body changed: the file's own length, ETag and encoding no longer apply.
  for (const key of ['content-length', 'content-encoding', 'etag', 'last-modified']) headers.delete(key);
  return new Response(html, { status: meta.status ?? page.status, headers });
}

// The page React would show for a missing address, answered with a real 404
// so Google drops it instead of indexing an empty page.
async function notFoundPage(request: Request, env: SeoEnv, what: string): Promise<Response> {
  const url = new URL(request.url);
  return renderPage(request, env, {
    status: 404,
    title: `${what} não encontrada`,
    description: SITE_DESCRIPTION,
    canonical: `${siteOrigin(env, request)}${url.pathname}`,
    ogType: 'website',
    noindex: true,
  });
}

// ── /noticia/:slug and /coluna/:slug ───────────────────────────────────────

type ImageView = {
  url: string;
  width: number | null;
  height: number | null;
  shareUrl: string | null;
  structuredDataUrls?: string[] | null;
};

type ArticleData = {
  type: PostType;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string;
  content: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  coverAlt: string | null;
  publishedAt: string | null;
  updatedAt: string;
  cover: ImageView | null;
  category?: { name: string; slug: string } | null;
  author?: { name: string; slug: string } | null;
  // A name the admin typed instead of a registered author (no author page).
  bylineName?: string | null;
};

// "Fonte: G1" under a story taken from another site, as on the React page.
function sourceHtml(post: Pick<ArticleData, 'sourceName' | 'sourceUrl'>): string {
  const url = post.sourceUrl && /^https?:\/\//i.test(post.sourceUrl) ? post.sourceUrl : null;
  let label = post.sourceName || '';
  if (!label && url) {
    try {
      label = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      label = url;
    }
  }
  if (!label) return '';
  const credit = url ? `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(label)}</a>` : escapeHtml(label);
  return `<p class="mt-8 text-sm"><strong>Fonte:</strong> ${credit}</p>`;
}

export async function articlePage(request: Request, env: SeoEnv, api: ApiFetch, slug: string): Promise<Response> {
  const result = await apiGet<{ post: ArticleData }>(api, `/api/posts/${slug}`, PAGE_TIMEOUT_MS);
  if (result.status === 'missing') return notFoundPage(request, env, 'Matéria');
  if (result.status === 'failed') return env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));

  const post = result.data.post;
  const origin = siteOrigin(env, request);
  const path = postPath(post.type, post.slug);

  // A column opened as /noticia/... (or the other way round): one address
  // per article, or Google splits its ranking between the two.
  if (new URL(request.url).pathname.replace(/\/$/, '') !== path) {
    return Response.redirect(`${new URL(request.url).origin}${path}`, 301);
  }

  const canonical = `${origin}${path}`;
  const description = post.excerpt || post.subtitle || post.title;
  const authorUrl = post.author ? `${origin}/autor/${post.author.slug}` : null;
  const cover = post.cover;

  const extraMeta: PageMeta['extraMeta'] = [];
  if (post.publishedAt) extraMeta.push(['property', 'article:published_time', post.publishedAt]);
  extraMeta.push(['property', 'article:modified_time', post.updatedAt]);
  if (post.category) extraMeta.push(['property', 'article:section', post.category.name]);
  const bylineName = post.author?.name ?? post.bylineName ?? null;
  if (bylineName) extraMeta.push(['property', 'article:author', bylineName]);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    headline: post.title,
    description,
    ...(cover ? { image: cover.structuredDataUrls?.length ? cover.structuredDataUrls : [cover.url] } : {}),
    ...(post.publishedAt ? { datePublished: post.publishedAt } : {}),
    dateModified: post.updatedAt,
    // A typed byline has no page to point to; unsigned news is credited to
    // the newsroom itself, which Google accepts as the author.
    author: post.author
      ? [{ '@type': 'Person', name: post.author.name, url: authorUrl }]
      : post.bylineName
        ? [{ '@type': 'Person', name: post.bylineName }]
        : [{ '@type': 'Organization', name: SITE_NAME, url: origin }],
    publisher: publisherJsonLd(origin),
    ...(post.category ? { articleSection: post.category.name } : {}),
    inLanguage: LANGUAGE,
    isAccessibleForFree: true,
  };

  const kicker = post.category
    ? `<a href="/categoria/${escapeHtml(post.category.slug)}">${escapeHtml(post.category.name)}</a>`
    : post.type === 'column'
      ? 'Opinião'
      : '';
  const lead = post.subtitle || post.excerpt;
  const byline = [
    post.author
      ? `Por <a href="/autor/${escapeHtml(post.author.slug)}">${escapeHtml(post.author.name)}</a>`
      : post.bylineName
        ? `Por ${escapeHtml(post.bylineName)}`
        : '',
    post.publishedAt ? `<time datetime="${escapeHtml(post.publishedAt)}">${escapeHtml(longDate(post.publishedAt))}</time>` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // The article as plain HTML, so Google reads it on the first pass. The
  // content was sanitized by the API before it was stored.
  const rootHtml =
    `<article class="mx-auto max-w-3xl px-4 py-10">` +
    (kicker ? `<p class="text-sm font-semibold uppercase">${kicker}</p>` : '') +
    `<h1 class="titulo mt-3 text-[2.1rem]">${escapeHtml(post.title)}</h1>` +
    (lead ? `<p class="mt-4 font-serif text-xl">${escapeHtml(lead)}</p>` : '') +
    (byline ? `<p class="mt-6 text-sm">${byline}</p>` : '') +
    (cover ? `<img class="mt-8 w-full" src="${escapeHtml(cover.url)}" alt="${escapeHtml(post.coverAlt ?? post.title)}" />` : '') +
    `<div class="corpo-materia mt-10">${post.content}</div>` +
    sourceHtml(post) +
    `</article>`;

  return renderPage(request, env, {
    title: post.title,
    description,
    canonical,
    ogType: 'article',
    image: cover?.shareUrl
      ? { url: cover.shareUrl, width: 1200, height: 630, alt: post.coverAlt ?? undefined }
      : cover
        ? { url: cover.url, alt: post.coverAlt ?? undefined }
        : null,
    extraMeta,
    jsonLd,
    rootHtml,
  });
}

function publisherJsonLd(origin: string) {
  return {
    '@type': 'NewsMediaOrganization',
    name: SITE_NAME,
    url: `${origin}/`,
    logo: { '@type': 'ImageObject', url: `${origin}/favicon.svg` },
  };
}

// ── /categoria/:slug and /autor/:slug ──────────────────────────────────────

type ListItem = {
  type: PostType;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: string | null;
};

function articleList(items: ListItem[]): string {
  if (items.length === 0) return '';
  const rows = items
    .map(
      (item) =>
        `<li class="mt-4"><a href="${postPath(item.type, item.slug)}">${escapeHtml(item.title)}</a>` +
        (item.excerpt ? `<p class="text-sm">${escapeHtml(item.excerpt)}</p>` : '') +
        `</li>`,
    )
    .join('');
  return `<ul class="mt-6">${rows}</ul>`;
}

export async function categoryPage(request: Request, env: SeoEnv, api: ApiFetch, slug: string): Promise<Response> {
  const [category, posts] = await Promise.all([
    apiGet<{ category: { name: string; slug: string } }>(api, `/api/categories/${slug}`, PAGE_TIMEOUT_MS),
    apiGet<{ items: ListItem[] }>(api, `/api/posts?type=news&category=${encodeURIComponent(slug)}&limit=20`, PAGE_TIMEOUT_MS),
  ]);
  if (category.status === 'missing') return notFoundPage(request, env, 'Editoria');
  if (category.status === 'failed') return env.ASSETS.fetch(request);

  const { name } = category.data.category;
  const items = posts.status === 'ok' ? posts.data.items : [];
  const origin = siteOrigin(env, request);
  const canonical = `${origin}/categoria/${category.data.category.slug}`;
  const description = `Últimas notícias de ${name} no ${SITE_NAME}.`;

  return renderPage(request, env, {
    title: name,
    description,
    canonical,
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name,
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${origin}/` },
    },
    rootHtml: `<section class="mx-auto max-w-3xl px-4 py-10"><h1 class="titulo text-3xl">${escapeHtml(name)}</h1>${articleList(items)}</section>`,
  });
}

type AuthorData = { name: string; slug: string; bio: string | null; columnTitle: string | null; photoUrl: string | null };

export async function authorPage(request: Request, env: SeoEnv, api: ApiFetch, slug: string): Promise<Response> {
  const [author, posts] = await Promise.all([
    apiGet<{ author: AuthorData }>(api, `/api/columnists/${slug}`, PAGE_TIMEOUT_MS),
    apiGet<{ items: ListItem[] }>(api, `/api/posts?author=${encodeURIComponent(slug)}&limit=20`, PAGE_TIMEOUT_MS),
  ]);
  if (author.status === 'missing') return notFoundPage(request, env, 'Página do autor');
  if (author.status === 'failed') return env.ASSETS.fetch(request);

  const person = author.data.author;
  const items = posts.status === 'ok' ? posts.data.items : [];
  const origin = siteOrigin(env, request);
  const canonical = `${origin}/autor/${person.slug}`;
  const description = person.bio?.trim() || `Textos de ${person.name} no ${SITE_NAME}.`;

  return renderPage(request, env, {
    title: person.columnTitle ? `${person.name}: ${person.columnTitle}` : person.name,
    description: description.length > 200 ? `${description.slice(0, 197)}...` : description,
    canonical,
    ogType: 'profile',
    image: person.photoUrl ? { url: person.photoUrl, width: 256, height: 256, alt: person.name } : null,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ProfilePage',
      url: canonical,
      mainEntity: {
        '@type': 'Person',
        name: person.name,
        url: canonical,
        ...(person.bio ? { description: person.bio } : {}),
        ...(person.photoUrl ? { image: person.photoUrl } : {}),
      },
    },
    rootHtml:
      `<section class="mx-auto max-w-3xl px-4 py-10"><h1 class="titulo text-3xl">${escapeHtml(person.name)}</h1>` +
      (person.bio ? `<p class="mt-4">${escapeHtml(person.bio)}</p>` : '') +
      `${articleList(items)}</section>`,
  });
}

// ── /colunistas ─────────────────────────────────────────────────────────────

type ColumnistData = AuthorData & {
  columnCount: number;
  latestColumn: { title: string; slug: string } | null;
};

export async function columnistsPage(request: Request, env: SeoEnv, api: ApiFetch): Promise<Response> {
  const columnists = await apiGet<{ authors: ColumnistData[] }>(api, '/api/columnists', PAGE_TIMEOUT_MS);
  if (columnists.status !== 'ok') return env.ASSETS.fetch(request);

  const origin = siteOrigin(env, request);
  const canonical = `${origin}/colunistas`;
  const description = `Os colunistas do ${SITE_NAME}: quem são e todas as colunas de cada um.`;
  const people = columnists.data.authors;

  const rows = people
    .map((person) => {
      const page = `/autor/${encodeURIComponent(person.slug)}`;
      return (
        `<li class="mt-6"><h2><a href="${page}">${escapeHtml(person.name)}</a></h2>` +
        (person.columnTitle ? `<p>${escapeHtml(person.columnTitle)}</p>` : '') +
        (person.bio ? `<p class="text-sm">${escapeHtml(person.bio)}</p>` : '') +
        (person.latestColumn
          ? `<p class="text-sm">Última coluna: <a href="${postPath('column', person.latestColumn.slug)}">${escapeHtml(person.latestColumn.title)}</a></p>`
          : '') +
        `</li>`
      );
    })
    .join('');

  return renderPage(request, env, {
    title: 'Colunistas',
    description,
    canonical,
    ogType: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'Colunistas',
      description,
      url: canonical,
      inLanguage: LANGUAGE,
      isPartOf: { '@type': 'WebSite', name: SITE_NAME, url: `${origin}/` },
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: people.map((person, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: { '@type': 'Person', name: person.name, url: `${origin}/autor/${person.slug}` },
        })),
      },
    },
    rootHtml:
      `<section class="mx-auto max-w-3xl px-4 py-10"><h1 class="titulo text-3xl">Colunistas</h1>` +
      (rows ? `<ul>${rows}</ul>` : '') +
      `</section>`,
  });
}

// ── /privacidade, /termos, /contato ────────────────────────────────────────

// The same words the React page shows, so Google (and the AdSense review)
// reads the policy without running JavaScript.

function richText(text: string): string {
  return pieces(text)
    .map((piece) => (piece.href ? `<a href="${escapeHtml(piece.href)}">${escapeHtml(piece.text)}</a>` : escapeHtml(piece.text)))
    .join('');
}

function legalHtml(page: LegalPage): string {
  const paragraphs = (list?: string[]) => (list ?? []).map((text) => `<p>${richText(text)}</p>`).join('');
  return (
    `<article><h1>${escapeHtml(page.title)}</h1><p>Última atualização: ${escapeHtml(UPDATED_AT)}</p>` +
    paragraphs(page.intro) +
    page.sections
      .map(
        (section) =>
          `<section id="${escapeHtml(section.id)}"><h2>${escapeHtml(section.title)}</h2>` +
          paragraphs(section.paragraphs) +
          (section.items ? `<ul>${section.items.map((item) => `<li>${richText(item)}</li>`).join('')}</ul>` : '') +
          paragraphs(section.after) +
          '</section>',
      )
      .join('') +
    '</article>'
  );
}

function contactHtml(): string {
  return (
    `<article><h1>${escapeHtml(CONTACT.title)}</h1>` +
    CONTACT.intro.map((text) => `<p>${richText(text)}</p>`).join('') +
    `<p>E-mail: <a href="mailto:${escapeHtml(CONTACT_EMAIL)}">${escapeHtml(CONTACT_EMAIL)}</a></p>` +
    `<ul>${CONTACT.topics.map((topic) => `<li>${richText(topic)}</li>`).join('')}</ul>` +
    '</article>'
  );
}

export const STATIC_PATHS = [PRIVACY.path, TERMS.path, CONTACT.path] as const;

export function staticPage(request: Request, env: SeoEnv, path: (typeof STATIC_PATHS)[number]): Promise<Response> {
  const origin = siteOrigin(env, request);
  const page = path === PRIVACY.path ? PRIVACY : path === TERMS.path ? TERMS : null;
  return renderPage(request, env, {
    title: page?.title ?? CONTACT.title,
    description: page?.description ?? CONTACT.description,
    canonical: `${origin}${path}`,
    ogType: 'website',
    rootHtml: page ? legalHtml(page) : contactHtml(),
  });
}

// ── sitemaps ────────────────────────────────────────────────────────────────

type SitemapData = {
  posts: Array<{ slug: string; type: PostType; title: string; publishedAt: string | null; updatedAt: string }>;
  categories: Array<{ slug: string; updatedAt: string }>;
  authors: Array<{ slug: string; updatedAt: string }>;
};

// Kept in the Worker's memory for a few minutes, so a robot reading both
// sitemaps (or reading them twice) costs one API request.
let sitemapCache: { at: number; data: SitemapData } | null = null;

async function sitemapData(api: ApiFetch): Promise<SitemapData | null> {
  if (sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL_MS) return sitemapCache.data;
  const result = await apiGet<SitemapData>(api, '/api/sitemap', SITEMAP_TIMEOUT_MS);
  if (result.status !== 'ok') return sitemapCache?.data ?? null;
  sitemapCache = { at: Date.now(), data: result.data };
  return result.data;
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

// 503 tells Google to come back later, instead of reading an empty sitemap.
function unavailable(): Response {
  return new Response('Sitemap temporarily unavailable.', {
    status: 503,
    headers: { 'retry-after': '600', 'content-type': 'text/plain; charset=utf-8' },
  });
}

export async function sitemap(request: Request, env: SeoEnv, api: ApiFetch): Promise<Response> {
  const data = await sitemapData(api);
  if (!data) return unavailable();
  const origin = siteOrigin(env, request);

  const url = (path: string, lastmod?: string) =>
    `<url><loc>${escapeXml(`${origin}${path}`)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`;

  const newest = data.posts[0]?.updatedAt;
  const entries = [
    url('/', newest),
    url('/noticias', newest),
    url('/colunistas'),
    ...STATIC_PATHS.map((path) => url(path)),
    ...data.categories.map((category) => url(`/categoria/${category.slug}`, category.updatedAt)),
    ...data.authors.map((author) => url(`/autor/${author.slug}`, author.updatedAt)),
    ...data.posts.map((post) => url(postPath(post.type, post.slug), post.updatedAt)),
  ];

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`,
  );
}

export async function newsSitemap(request: Request, env: SeoEnv, api: ApiFetch): Promise<Response> {
  const data = await sitemapData(api);
  if (!data) return unavailable();
  const origin = siteOrigin(env, request);
  const since = Date.now() - NEWS_WINDOW_MS;

  const entries = data.posts
    .filter((post) => post.publishedAt && Date.parse(post.publishedAt) >= since)
    .map(
      (post) =>
        `<url><loc>${escapeXml(`${origin}${postPath(post.type, post.slug)}`)}</loc>` +
        `<news:news><news:publication><news:name>${SITE_NAME}</news:name><news:language>pt</news:language></news:publication>` +
        `<news:publication_date>${escapeXml(post.publishedAt!)}</news:publication_date>` +
        `<news:title>${escapeXml(post.title)}</news:title></news:news></url>`,
    );

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n` +
      `${entries.join('\n')}\n</urlset>\n`,
  );
}

// ── robots.txt ──────────────────────────────────────────────────────────────

// Built here, not a file in public/, so the sitemap address follows SITE_URL.
export function robots(request: Request, env: SeoEnv): Response {
  const origin = siteOrigin(env, request);
  const body = [
    'User-agent: *',
    // Pages only for a logged-in person, forms, and the API.
    'Disallow: /painel',
    'Disallow: /entrar',
    'Disallow: /cadastro',
    'Disallow: /esqueci-senha',
    'Disallow: /redefinir-senha',
    'Disallow: /minha-conta',
    'Disallow: /salvos',
    // The links in the newsletter e-mails (confirm, leave).
    'Disallow: /newsletter/',
    // Search results: endless combinations of the same articles.
    'Disallow: /busca',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    `Sitemap: ${origin}/sitemap-news.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

// ── headers ─────────────────────────────────────────────────────────────────

// Keep in sync with public/_headers.
export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https://res.cloudinary.com https://*.google-analytics.com https://*.googletagmanager.com; media-src 'self' https://res.cloudinary.com; " +
    "frame-src https://www.youtube-nocookie.com; connect-src 'self' https://api.cloudinary.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self' https://*.googletagmanager.com; font-src 'self' data:; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'; manifest-src 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
