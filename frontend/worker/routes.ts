// The addresses that get more than the plain file: the same on Cloudflare
// (worker/index.ts) and on Render (backend/src/site/site.ts, which loads this
// file built into dist-server/routes.js by `npm run build:server`).
//
// Answers null for every other address: the caller serves the file itself.

import {
  STATIC_PATHS,
  articlePage,
  authorPage,
  categoryPage,
  columnistsPage,
  newsSitemap,
  robots,
  sitemap,
  staticPage,
  type ApiFetch,
  type SeoEnv,
} from './seo';

export type { ApiFetch, Assets, SeoEnv } from './seo';

export async function seoResponse(request: Request, env: SeoEnv, api: ApiFetch): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null;
  const url = new URL(request.url);

  if (url.pathname === '/robots.txt') return robots(request, env);
  if (url.pathname === '/sitemap.xml') return sitemap(request, env, api);
  if (url.pathname === '/sitemap-news.xml') return newsSitemap(request, env, api);

  const staticPath = STATIC_PATHS.find((path) => url.pathname.replace(/\/$/, '') === path);
  if (staticPath) return staticPage(request, env, staticPath);

  if (url.pathname.replace(/\/$/, '') === '/colunistas') return columnistsPage(request, env, api);

  const page = url.pathname.match(/^\/(noticia|coluna|categoria|autor)\/([a-z0-9-]+)\/?$/);
  if (page) {
    const [, kind, slug] = page as unknown as [string, string, string];
    if (kind === 'categoria') return categoryPage(request, env, api, slug);
    if (kind === 'autor') return authorPage(request, env, api, slug);
    return articlePage(request, env, api, slug);
  }

  return null;
}
