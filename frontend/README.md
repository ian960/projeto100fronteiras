# Portal Sem Fronteiras — frontend

React 19 + Vite 8 + TypeScript. One app with two halves:

- **the site** (`/`, `/noticia/:slug`, `/coluna/:slug`, `/categoria/:slug`, …) for readers;
- **the panel** (`/painel/...`) for the admin and the columnists. It is a separate
  download, Quill included, so a reader opening a news link never pays for the editor.

## Running

**With Docker**, `docker compose up` at the repository root runs the site
together with the API and the database: see the [root README](../README.md).

**Without Docker**, the backend must be running first (`npm run dev` in
`backend/`):

```bash
npm install
cp .env.example .env     # only if the backend is not on port 3333
npm run dev              # http://localhost:5173
```

Every request to `/api` is forwarded by Vite to `VITE_API_PROXY_TARGET`. The
browser only ever talks to `localhost:5173`, so the session cookie just works:
no CORS setup, no tokens.

| script | what it does |
|---|---|
| `npm run dev` | development server with hot reload |
| `npm run typecheck` | TypeScript only; prints nothing when all is well |
| `npm run build` | typecheck, then the production bundle in `dist/` |
| `npm run preview` | serves `dist/` locally, same `/api` forwarding |

Node 22.22 or newer (React Router 8 requires it).

## Production (Cloudflare)

`npm run build` makes `dist/`; Cloudflare serves it, and `worker/index.ts`
handles three things (config in `wrangler.jsonc`, steps in
[DEPLOY.md](../DEPLOY.md)):

- `/api/*` is forwarded to the API on Render with `PROXY_SECRET` and the
  visitor's IP. Same origin for the browser, so the cookie works on Safari.
- `/noticia/:slug` and `/coluna/:slug` get the article's `<meta og:*>` tags
  written into `index.html`: WhatsApp and Facebook do not run JavaScript.
- A ping every 10 minutes keeps Render's free API from sleeping.

`public/_headers` sets the security headers, including a Content Security
Policy. **A new outside service (a font host, an analytics script, another
video site) has to be added there and in `SECURITY_HEADERS` in
`worker/index.ts`**, or the browser blocks it.

| script | what it does |
|---|---|
| `npm run preview:worker` | the built site behind the Worker, against the API on `localhost:3333` |
| `npm run deploy` | build and publish by hand (normally Cloudflare does it on every push) |

## Where things are

```
src/
  main.tsx              QueryClient + router
  router.tsx            every route; the panel routes are lazy
  styles/index.css      Tailwind, fonts, colour tokens (@theme), article body, Quill skin

  lib/
    api.ts              fetch wrapper: get/post/patch/del/upload, ApiError
    pt.ts               the API answers in English; this translates its messages
    types.ts            the shapes the API returns
    format.ts           dates, post URLs, labels
    hooks.ts            useMe, useLogin, useLogout, useHealth, useDocumentTitle
    bookmarks.ts        "Salvar para ler depois" — localStorage, no account

  components/ui.tsx     buttons, fields, alerts, pagination, avatar

  site/                 what readers see
    SiteLayout.tsx      masthead, category menu, footer
    parts.tsx           the border line, kickers, bylines, story layouts, share
    queries.ts          TanStack Query hooks for the public endpoints
    pages/              home, post, listings, search, saved, login, sign-up

  panel/                what the admin and columnists see
    PanelLayout.tsx     guards (visitor → login, reader → notice) + menu
    routes.tsx          each panel page wrapped with the role it needs
    queries.ts          hooks for /admin/* and /columnist/* + mutations
    RichTextEditor.tsx  Quill 2, uncontrolled, HTML out
    widgets.tsx         modal, toast, confirm button
    media.ts            sending a file: sign, upload to Cloudinary, register
    mediaFields.tsx     cover, author photo, video, PDFs, photo in the text
    pages/              dashboard, lists, editor, categories, authors, users, profile
```

## Conventions

- **Server state lives in TanStack Query**, never copied into `useState`. Query
  keys start with `'site'` (public data) or `'panel'` (logged-in data). Panel
  mutations invalidate both (`useInvalidateContent`), so the site never shows
  stale content after an edit.
- **The backend decides.** The panel hides buttons a role cannot use, but the
  API enforces every rule again. A 403 means a bug in the panel, not a feature.
- **Errors come from the API** with field names (`fields.title`), already
  translated by `pt.ts`, and are shown next to the field they belong to.
- **Article HTML** is sanitised by the backend before it is stored; the site
  renders it with `dangerouslySetInnerHTML` inside `.corpo-materia`.

## Brand

Colours and fonts are tokens in `src/styles/index.css` (`@theme`). When the
client's final logo and colours arrive, change them there; components use the
token names (`anil`, `tinta`, `sol`, `mata`…), not hex values.

## Images, videos and PDFs

Files go straight from the browser to Cloudinary, never through the API
(`src/panel/media.ts`):

1. `POST /api/media/signature {purpose}` — the API answers with Cloudinary's
   upload URL and signed fields (folder, file id, accepted formats).
2. The file is sent to Cloudinary with those fields, untouched. XHR, for the
   progress bar.
3. `POST /api/media` with Cloudinary's answer — the API checks Cloudinary's
   signature and records the file.

The fields that take files are in `src/panel/mediaFields.tsx`: cover and author
photo (upload or import from a link), video (YouTube or upload), PDF
attachments, and the dialog behind the editor's photo button. The API sends
every file back with ready-made URLs (`srcset` for images, a poster frame for
videos, page 1 for PDFs); the site never builds a Cloudinary URL itself.

Without `CLOUDINARY_URL` in the backend, `/api/health` reports
`uploads: "disabled"` and the file fields say so instead of offering buttons.

The editor drops images pasted from other sites and image files dropped into
it: they would be removed by the server on save anyway. The photo button is
the way in.
