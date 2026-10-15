# Portal Sem Fronteiras — frontend

React 19 + Vite 8 + TypeScript. One app with two halves:

- **the site** (`/`, `/noticia/:slug`, `/coluna/:slug`, `/categoria/:slug`, …) for readers;
- **the panel** (`/painel/...`) for the admin and the columnists. It is a separate
  download, Quill included, so a reader opening a news link never pays for the editor.

## Running

The backend must be running first (`npm run dev` in `backend/`).

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
    widgets.tsx         modal, toast, confirm button, image and video fields
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

## Uploads

Image and video upload need the R2 variables in the backend. Without them,
`/api/health` reports `uploads: "disabled"` and the panel asks for an image
address instead of a file. Sending `.mp4` files straight from the browser to R2
also needs a CORS rule on the bucket that allows `PUT` from the site's address.
