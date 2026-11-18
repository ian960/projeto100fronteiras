import { defineConfig } from 'vite';

// `npm run build:server`: worker/routes.ts (the SEO pages, sitemaps and
// robots.txt) as one plain JavaScript file, dist-server/routes.js, for the API
// on Render to load (backend/src/site/site.ts). The site itself is still
// `npm run build` (dist/).
export default defineConfig({
  publicDir: false,
  build: {
    ssr: 'worker/routes.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    target: 'node22',
  },
});
