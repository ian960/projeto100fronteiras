import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import zlib from 'node:zlib';
import type { Request as ExpressRequest, RequestHandler, Response as ExpressResponse } from 'express';
import { clientIp } from '../shared/middlewares/proxyGuard';
import { logger } from '../shared/utils/logger';

// The site itself, served by this API on Render: portal100fronteiras.com.br
// points here, not to Cloudflare, because TIM blocks Cloudflare's shared IPs.
//
// Render builds the site first (render.yaml) and this server answers, for
// every address outside /api:
//
//   /noticia/:slug, /coluna/:slug,   the page with title, description,
//   /categoria/:slug, /autor/:slug,  preview card and text already inside,
//   /colunistas, /privacidade,       for Google and WhatsApp
//   /termos, /contato,
//   /sitemap.xml, /sitemap-news.xml, (frontend/worker/routes.ts, the same
//   /robots.txt                      code the Cloudflare Worker runs)
//   a file in frontend/dist          the file, with the headers in _headers
//   anything else                    index.html, and React takes it from there
//
// Pages asked for on the *.onrender.com address are redirected to SITE_URL.
//
// Without frontend/dist (development, Docker, tests) none of this is mounted:
// Vite serves the site on its own port.

type ApiFetch = (path: string, timeoutMs: number) => Promise<Response>;
type Assets = { fetch(request: Request): Promise<Response> };
type SeoModule = {
  seoResponse(request: Request, env: { ASSETS: Assets; SITE_URL?: string }, api: ApiFetch): Promise<Response | null>;
};

export type SiteOptions = {
  // frontend/dist: index.html, assets/, _headers...
  distDir: string;
  // frontend/dist-server/routes.js, from `npm run build:server`.
  routesFile: string;
  // Canonical address for links and sitemaps (SITE_URL).
  siteUrl?: string;
  // Where this same server answers /api, for the SEO pages' own requests.
  apiOrigin: string;
  // PROXY_SECRET, so those requests can say whose page it is (rate limits).
  proxySecret?: string;
};

const DEFAULT_DIST = path.resolve(__dirname, '../../../frontend/dist');

// The site's folder when it has been built, otherwise null.
export function builtSiteDir(dir = process.env.SITE_DIST_DIR || DEFAULT_DIST): string | null {
  return existsSync(path.join(dir, 'index.html')) ? dir : null;
}

// ── _headers ────────────────────────────────────────────────────────────────

// The same file Cloudflare reads (frontend/public/_headers):
//   /path or /prefix/*
//     Header-Name: value
type HeaderRule = { pattern: string; headers: Array<[string, string]> };

export function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      rules.push({ pattern: raw.trim(), headers: [] });
      continue;
    }
    const colon = raw.indexOf(':');
    const rule = rules.at(-1);
    if (rule && colon > 0) rule.headers.push([raw.slice(0, colon).trim().toLowerCase(), raw.slice(colon + 1).trim()]);
  }
  return rules;
}

function matches(pattern: string, pathname: string): boolean {
  if (pattern.endsWith('*')) return pathname.startsWith(pattern.slice(0, -1));
  return pathname === pattern;
}

// ── files ───────────────────────────────────────────────────────────────────

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
};

// Text compresses well; images and fonts already are compressed.
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|xml|manifest\+json)|image\/svg\+xml)/;

// Files Cloudflare reads as settings and never serves.
const HIDDEN = new Set(['/_headers', '/_redirects']);

function createAssets(distDir: string): Assets {
  const rules = (() => {
    try {
      return parseHeadersFile(readFileSync(path.join(distDir, '_headers'), 'utf8'));
    } catch {
      return [];
    }
  })();

  async function file(pathname: string): Promise<{ body: Buffer; type: string; etag: string; pathname: string } | null> {
    if (HIDDEN.has(pathname)) return null;
    const relative = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const full = path.join(distDir, relative);
    // "/../../etc/passwd" and the like stay outside.
    if (!full.startsWith(distDir + path.sep)) return null;
    try {
      const info = await stat(full);
      if (!info.isFile()) return null;
      return {
        body: await readFile(full),
        type: TYPES[path.extname(full).toLowerCase()] ?? 'application/octet-stream',
        etag: `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`,
        pathname: relative,
      };
    } catch {
      return null;
    }
  }

  return {
    async fetch(request) {
      let pathname: string;
      try {
        pathname = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response('Bad request', { status: 400 });
      }

      let found = await file(pathname);
      // Single-page app: an address without a file is a React page. A missing
      // /assets/ file is a real 404 (an old tab asking for a replaced bundle).
      if (!found && !pathname.startsWith('/assets/')) found = await file('/index.html');
      if (!found) return new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });

      const headers = new Headers({ 'content-type': found.type, etag: found.etag });
      // index.html names the current bundles: always ask again.
      if (found.pathname.endsWith('.html')) headers.set('cache-control', 'no-cache');
      for (const rule of rules) {
        if (matches(rule.pattern, found.pathname) || matches(rule.pattern, pathname)) {
          for (const [key, value] of rule.headers) headers.set(key, value);
        }
      }

      if (request.headers.get('if-none-match') === found.etag) return new Response(null, { status: 304, headers });
      return new Response(new Uint8Array(found.body), { status: 200, headers });
    },
  };
}

// ── sending ─────────────────────────────────────────────────────────────────

// Static files are compressed once and kept: the same few bundles are asked
// for all day, and Render's free CPU is small.
const compressedCache = new Map<string, Buffer>();
const CACHE_LIMIT = 200;

function encodingFor(req: ExpressRequest): 'br' | 'gzip' | null {
  const accepted = req.get('accept-encoding') ?? '';
  if (/\bbr\b/.test(accepted)) return 'br';
  if (/\bgzip\b/.test(accepted)) return 'gzip';
  return null;
}

function compress(body: Buffer, encoding: 'br' | 'gzip', cacheKey: string | null): Buffer {
  const key = cacheKey && `${encoding}:${cacheKey}`;
  const cached = key ? compressedCache.get(key) : undefined;
  if (cached) return cached;
  const result =
    encoding === 'br'
      ? zlib.brotliCompressSync(body, {
          params: {
            [zlib.constants.BROTLI_PARAM_QUALITY]: cacheKey ? 9 : 4,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: body.length,
          },
        })
      : zlib.gzipSync(body, { level: cacheKey ? 9 : 5 });
  if (key) {
    if (compressedCache.size >= CACHE_LIMIT) compressedCache.clear();
    compressedCache.set(key, result);
  }
  return result;
}

async function send(req: ExpressRequest, res: ExpressResponse, response: Response): Promise<void> {
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (response.status === 304 || response.status === 204) {
    res.end();
    return;
  }

  let body: Buffer = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') ?? '';
  const encoding = encodingFor(req);
  if (encoding && body.length > 1024 && COMPRESSIBLE.test(type)) {
    const etag = response.headers.get('etag');
    body = compress(body, encoding, etag && `${req.path}:${etag}`);
    res.setHeader('content-encoding', encoding);
  }
  res.setHeader('vary', 'Accept-Encoding');
  res.setHeader('content-length', body.length);
  res.end(req.method === 'HEAD' ? undefined : body);
}

// ── the middleware ──────────────────────────────────────────────────────────

function webRequest(req: ExpressRequest): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  // req.protocol is https behind Render's proxy (trust proxy, app.ts).
  return new Request(`${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`, {
    method: req.method,
    headers,
  });
}

export function siteMiddleware(options: SiteOptions): RequestHandler {
  const assets = createAssets(path.resolve(options.distDir));

  // The bundle is ES modules and this API is CommonJS: import() loads it.
  // Without the bundle the files are still served, only without the SEO extras.
  const seo: Promise<SeoModule | null> = existsSync(options.routesFile)
    ? (import(pathToFileURL(options.routesFile).href) as Promise<SeoModule>).catch((err: unknown) => {
        logger.error('Could not load the SEO pages (frontend/dist-server/routes.js)', { err });
        return null;
      })
    : Promise.resolve(null);
  if (!existsSync(options.routesFile)) {
    logger.warn('frontend/dist-server/routes.js not found: run `npm run build:server` in frontend/ for the SEO pages.');
  }

  const env = { ASSETS: assets, SITE_URL: options.siteUrl ?? '' };
  const canonicalHost = (() => {
    try {
      return options.siteUrl ? new URL(options.siteUrl).hostname : null;
    } catch {
      return null;
    }
  })();

  return (req, res, next) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // Someone on the Render address (portal-api-xxxx.onrender.com): send them
    // to the real one, so links they copy or share carry the site's domain.
    // /api stays reachable there (health check, the Worker's ping).
    if (canonicalHost && req.hostname !== canonicalHost && req.hostname.endsWith('.onrender.com')) {
      res.redirect(301, `${options.siteUrl!.replace(/\/+$/, '')}${req.originalUrl}`);
      return;
    }

    const ip = clientIp(req, options.proxySecret);
    const api: ApiFetch = (apiPath, timeoutMs) => {
      const headers: Record<string, string> = { accept: 'application/json' };
      if (options.proxySecret) {
        headers['x-proxy-secret'] = options.proxySecret;
        headers['x-client-ip'] = ip;
      }
      return fetch(new URL(apiPath, options.apiOrigin), { headers, signal: AbortSignal.timeout(timeoutMs) });
    };

    void (async () => {
      const request = webRequest(req);
      const module = await seo;
      const response = (await module?.seoResponse(request, env, api)) ?? (await assets.fetch(request));
      await send(req, res, response);
    })().catch(next);
  };
}
