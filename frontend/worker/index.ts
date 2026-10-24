// The site in production, on Cloudflare. Cloudflare serves the built files
// (dist/) by itself; this Worker only runs for the paths listed under
// run_worker_first in wrangler.jsonc, plus the scheduled ping:
//
//   /api/*            forwarded to the API on Render. The browser only ever
//                     talks to the site's own address, so the login cookie is
//                     first-party (Safari blocks it otherwise) and no CORS.
//   /noticia/:slug    index.html with the article's headline, summary and
//   /coluna/:slug     cover in <meta> tags: the preview WhatsApp shows.
//   every 10 minutes  a request to the API, so Render's free plan does not
//                     put it to sleep (waking up takes about a minute).

interface Env {
  ASSETS: Fetcher;
  // Where the API runs, e.g. https://portal-api.onrender.com (wrangler.jsonc).
  API_ORIGIN: string;
  // The same value as PROXY_SECRET on Render. A secret, set in the Cloudflare
  // dashboard or with `npx wrangler secret put PROXY_SECRET`.
  PROXY_SECRET: string;
}

const SITE_NAME = 'Sem Fronteiras';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return proxyToApi(request, env);
    }

    const article = url.pathname.match(/^\/(noticia|coluna)\/([a-z0-9-]+)\/?$/);
    if (article && (request.method === 'GET' || request.method === 'HEAD')) {
      return pageWithPreview(request, env, article[2]!);
    }

    return env.ASSETS.fetch(request);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      fetch(`${env.API_ORIGIN}/api/health`).then(
        () => undefined,
        () => undefined,
      ),
    );
  },
} satisfies ExportedHandler<Env>;

// ── /api/* ──────────────────────────────────────────────────────────────────

function apiRequest(env: Env, path: string, init: RequestInit & { clientIp?: string; protocol?: string }): Request {
  const headers = new Headers(init.headers);
  // Render picks the service by Host: it must be the API's, not the site's.
  headers.delete('host');
  // Proves to the API that the request came through here (proxyGuard.ts).
  headers.set('x-proxy-secret', env.PROXY_SECRET);
  // Every request reaches Render from a Cloudflare address. This is the
  // visitor's own, for the login rate limit.
  headers.set('x-client-ip', init.clientIp ?? '');
  headers.set('x-forwarded-proto', init.protocol ?? 'https');

  return new Request(new URL(path, env.API_ORIGIN), { ...init, headers, redirect: 'manual' });
}

async function proxyToApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    return await fetch(
      apiRequest(env, url.pathname + url.search, {
        method: request.method,
        // Cookie, Content-Type, Accept... go as they came. Set-Cookie comes
        // back untouched, for the site's own address.
        headers: request.headers,
        body: hasBody ? request.body : null,
        clientIp: request.headers.get('cf-connecting-ip') ?? '',
        protocol: url.protocol.replace(':', ''),
      }),
    );
  } catch {
    return Response.json(
      { error: { code: 'UPSTREAM_UNAVAILABLE', message: 'The server is not answering. Try again in a minute.' } },
      { status: 502 },
    );
  }
}

// ── link previews ───────────────────────────────────────────────────────────

type PostForPreview = {
  title: string;
  excerpt: string;
  publishedAt: string | null;
  cover: { url: string; shareUrl: string | null } | null;
  author: { name: string } | null;
};

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// WhatsApp, Facebook and X read the page's <meta> tags without running any
// JavaScript, so a single-page app would show the same generic card for every
// article. Here the tags of the article are written into index.html before it
// leaves. If anything fails, the plain page goes out: the article still opens.
async function pageWithPreview(request: Request, env: Env, slug: string): Promise<Response> {
  const page = await env.ASSETS.fetch(new Request(new URL('/', request.url), { headers: request.headers }));

  let post: PostForPreview | null = null;
  try {
    const response = await fetch(
      apiRequest(env, `/api/posts/${slug}`, {
        clientIp: request.headers.get('cf-connecting-ip') ?? '',
        headers: { accept: 'application/json' },
      }),
    );
    if (response.ok) post = ((await response.json()) as { data: { post: PostForPreview } }).data.post;
  } catch {
    // The API is down or asleep: the page goes out without the preview.
  }

  if (!post || !page.ok) return page;

  const url = new URL(request.url);
  const title = `${post.title} | ${SITE_NAME}`;
  const description = post.excerpt || post.title;

  const tags: Array<[string, string, string]> = [
    ['name', 'description', description],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:type', 'article'],
    ['property', 'og:title', post.title],
    ['property', 'og:description', description],
    ['property', 'og:url', `${url.origin}${url.pathname}`],
    ['name', 'twitter:card', post.cover ? 'summary_large_image' : 'summary'],
  ];
  if (post.cover?.shareUrl) {
    tags.push(['property', 'og:image', post.cover.shareUrl]);
    tags.push(['property', 'og:image:width', '1200']);
    tags.push(['property', 'og:image:height', '630']);
  } else if (post.cover) {
    tags.push(['property', 'og:image', post.cover.url]);
  }
  if (post.publishedAt) tags.push(['property', 'article:published_time', post.publishedAt]);
  if (post.author) tags.push(['property', 'article:author', post.author.name]);

  const html = tags
    .map(([attribute, key, value]) => `<meta ${attribute}="${key}" content="${escapeAttribute(value)}" />`)
    .join('');

  const response = new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(title);
      },
    })
    // The generic tags from index.html, replaced by the article's own.
    .on('meta[name="description"], meta[property^="og:"], meta[name^="twitter:"]', {
      element(element) {
        element.remove();
      },
    })
    .on('head', {
      element(element) {
        element.append(`${html}<link rel="canonical" href="${escapeAttribute(`${url.origin}${url.pathname}`)}" />`, {
          html: true,
        });
      },
    })
    .transform(page);

  // Same headers as every other page (public/_headers): this response is
  // built here, so Cloudflare does not add them by itself.
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  headers.set('cache-control', 'no-cache');
  return new Response(response.body, { status: response.status, headers });
}

// Keep in sync with public/_headers.
const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy':
    "default-src 'self'; img-src 'self' data: https://res.cloudinary.com; media-src 'self' https://res.cloudinary.com; " +
    "frame-src https://www.youtube-nocookie.com; connect-src 'self' https://api.cloudinary.com; " +
    "style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; object-src 'none'; " +
    "base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};
