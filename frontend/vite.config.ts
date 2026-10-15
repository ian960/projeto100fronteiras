import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development every /api request is forwarded to the backend. The browser
// only ever talks to Vite's own origin, so the session cookie is first-party:
// no CORS, no SameSite surprises, and the same relative /api paths work in
// production behind nginx.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:3333';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: false },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': { target, changeOrigin: false },
      },
    },
  };
});
