// The site on Cloudflare (projeto-sem-fronteiras.iandevbr.workers.dev). The
// real address, portal100fronteiras.com.br, is served by the API on Render
// instead (backend/src/site/site.ts): TIM blocks Cloudflare's shared IPs.
// This Worker stays for the ping below and as a second address.
//
// Cloudflare serves the built files (dist/) by itself; this Worker only runs
// for the paths listed under run_worker_first in wrangler.jsonc, plus the
// scheduled ping:
//
//   /api/*            forwarded to the API on Render. The browser only ever
//                     talks to the site's own address, so the login cookie is
//                     first-party (Safari blocks it otherwise) and no CORS.
//   /noticia/:slug    index.html with the page's title, description, preview
//   /coluna/:slug     card, structured data and text already inside, for
//   /categoria/:slug  Google and for WhatsApp's preview (seo.ts).
//   /autor/:slug
//   /colunistas       the list of columnists, each linking to their page
//   /privacidade      the same, with the page's whole text (Google reads
//   /termos           these before approving AdSense)
//   /contato
//   /sitemap.xml      built from the published articles (seo.ts).
//   /sitemap-news.xml
//   /robots.txt
//   every 10 minutes  a request to the API, so Render's free plan does not
//                     put it to sleep (waking up takes about a minute).

import { seoResponse, type ApiFetch, type SeoEnv } from './routes';

interface Env extends SeoEnv {
  ASSETS: Fetcher;
  // Where the API runs, e.g. https://portal-api.onrender.com (wrangler.jsonc).
  API_ORIGIN: string;
  // The same value as PROXY_SECRET on Render. A secret, set in the Cloudflare
  // dashboard or with `npx wrangler secret put PROXY_SECRET`.
  PROXY_SECRET: string;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      return proxyToApi(request, env);
    }

    const seo = await seoResponse(request, env, apiFetch(request, env));
    if (seo) return seo;

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

// GETs from the Worker itself (pages and sitemaps), with a time limit: when
// Render is slow the page goes out without the extras instead of hanging.
function apiFetch(request: Request, env: Env): ApiFetch {
  const clientIp = request.headers.get('cf-connecting-ip') ?? '';
  return (path, timeoutMs) =>
    fetch(apiRequest(env, path, { clientIp, headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) }));
}
