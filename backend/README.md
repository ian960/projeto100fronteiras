# Portal Sem Fronteiras — API

Backend of a news portal with an admin panel and a columnists area.

## Roles

| role | login | what they do |
|---|---|---|
| `admin` | yes | full control: news, columns, categories, authors, users |
| `columnist` | yes | writes only their own columns, submits them for review |
| `reader` | yes | default on sign-up; no panel access |

Everyone registers as `reader`. A columnist joins by signing up themselves and
being promoted by the admin — that way nobody ever sends a password over chat.

Reader bookmarks ("save for later") live in the browser's `localStorage`. The
only backend cost is `GET /api/posts/by-ids`.

## Business rules the code enforces

1. News always has a category; a column never does. CHECK constraint in the migration.
2. At most one featured post. Partial unique index, so the update runs in a transaction.
3. Everything is born a draft. Going live is a separate, explicit call.
4. A columnist can never write `status = 'published'` — there is no route for it.
5. Once published, only the admin edits. Tell the client this during training.
6. Publishing requires excerpt, body and — for news — a cover image.
7. HTML from the editor is sanitized server-side on every write.
8. No email flow: the admin resets passwords from the panel, which kills the
   target's live sessions immediately.

## Running locally

**With Docker** (database, API and site with one command): see the
[root README](../README.md). The commands below then run inside the
container, e.g. `docker compose exec api npm test`.

**Without Docker**, as described here, the API runs on your machine and only
Postgres is in Docker.

Only `DATABASE_URL` is required. Cloudinary, `SESSION_SECRET` and the seed
variables all have development defaults, so the API runs before anyone has
Cloudinary keys. To upload images, videos and PDFs, set `CLOUDINARY_URL` (see
[Media](#media-cloudinary)).

```bash
docker compose up -d db         # from the repository root: only Postgres
cd backend
cp .env.example .env            # set DATABASE_URL (check the port in docker-compose.yml)
npm install
npm run db:generate             # Prisma Client into src/generated/prisma
npm run db:migrate              # applies pending migrations
npm run db:seed                 # first admin + the "Redação" byline
npm run dev
```

The seed prints the login. Development default: `admin@portal.local` / `admin12345`.

`GET /api/health` shows which optional features are on:

```json
{ "data": { "ok": true, "environment": "development", "uploads": "disabled" } }
```

With Cloudinary on, `uploads` is `"cloudinary"`.

### Without Cloudinary

Everything works except `/api/media/*`, which answers
`503 SERVICE_UNAVAILABLE`, and publishing **news**, which needs a cover image.
Columns, categories, users and drafts all work.

### Manual testing

Import `docs/insomnia-portal.json` into Insomnia. Sessions are cookie-based:
log in once and Insomnia keeps and sends the cookie. There is no token to copy.

## Tests

```bash
npm run db:test:setup   # creates .env.test from .env and the _test database (idempotent)
npm test
```

In Docker: `docker compose exec api npm run db:test:setup`, then
`docker compose exec api npm test`. There the address comes from
`TEST_DATABASE_URL` (set in `docker-compose.yml`) and no `.env.test` is written.

The suite rebuilds the test database on every run by replaying the files in
`prisma/migrations`, so the hand-written SQL (CHECK constraints, the partial
unique index) is tested too. It refuses to run unless the database name ends in
`_test`.

It never talks to the real Cloudinary. Two groups run one after the other:

- **api** — everything, against a fake Cloudinary on `127.0.0.1:4599`
  (`tests/fake-cloudinary/server.ts`). It checks signatures the same way
  Cloudinary does, enforces `allowed_formats` and `overwrite`, and serves files
  back under the same URL layout.
- **without-cloudinary** — `tests/runtime.spec.ts`, with `CLOUDINARY_URL`
  empty, proving the API runs without keys.

`npm run typecheck` checks `src/`, `tests/` and `scripts/` — vitest does not
type-check, so this is the only place test types are verified.

## Production

On Render, as described in [`render.yaml`](../render.yaml) and
[DEPLOY.md](../DEPLOY.md):

```bash
npm ci --include=dev && npm run build                 # build: prisma generate + tsc
npx prisma migrate deploy && node dist/server.js      # start
```

`NODE_ENV=production` refuses to start without `SESSION_SECRET`,
`CLOUDINARY_URL` and `PROXY_SECRET`. The API is reached only through the
site's Cloudflare Worker, which adds two headers
(`shared/middlewares/proxyGuard.ts`):

- `x-proxy-secret`: equal to `PROXY_SECRET`, or the request gets a 403.
  Render's health check (`/api/health`) is the only exception.
- `x-client-ip`: the visitor's address. Behind the Worker every request
  comes from Cloudflare, so the login rate limit keys on this instead of
  `req.ip`; otherwise everyone would share one limit.

The Prisma generator uses `moduleFormat = "cjs"`. Without it, the generated
client contains `import.meta.url`, which `tsx` tolerates in development but
crashes `node dist/server.js`.

## Architecture

```
src/
  config/      env (validated at boot), prisma, session, cloudinary
  shared/      errors, middlewares, http helpers, utils, types
  modules/<name>/
    *.types.ts                 entity shapes, one composed type per query
    *.repository.types.ts      DTOs in
    *.repository.interfaces.ts contract
    *.repository.ts            the only file that talks to Prisma
    *.policy.ts                who may do what (posts only)
    *.service.ts               business rules
    *.controller.ts            parse, call, respond
    *.routes.ts                router factory, one per role
```

Permission middleware is mounted on the router, never on individual routes, so
a route added later is protected by construction.

`posts.policy.ts` holds every permission rule for posts as pure functions. The
policy decides, the service orchestrates, the repository executes.

Repositories also turn database rows into what the API returns: a media row
becomes a view with ready-made URLs (`media.urls.ts`), an author's photo
becomes `photoUrl`. Services work with ids; no URL is ever stored.

## Endpoints

### Public
```
GET    /api/health
GET    /api/home
GET    /api/categories                 GET /api/categories/:slug
GET    /api/columnists                 GET /api/columnists/:slug
GET    /api/posts?type=&category=&author=&q=&page=&limit=
GET    /api/posts/by-ids?ids=a,b,c
GET    /api/posts/:slug
POST   /api/auth/register              POST /api/auth/login
POST   /api/auth/logout
```

### Authenticated
```
GET    /api/auth/me
POST   /api/auth/change-password
POST   /api/media/signature            POST /api/media
POST   /api/media/import               DELETE /api/media/:id   (admin)
```

### Admin
```
GET    /api/admin/users                GET    /api/admin/users/:id
POST   /api/admin/users/:id/promote    PATCH  /api/admin/users/:id
POST   /api/admin/users/:id/reset-password
CRUD   /api/admin/categories
CRUD   /api/admin/authors
CRUD   /api/admin/posts
POST   /api/admin/posts/:id/publish
POST   /api/admin/posts/:id/unpublish
POST   /api/admin/posts/:id/feature
```

### Columnist
```
GET    /api/columnist/posts            GET    /api/columnist/posts/:id
POST   /api/columnist/posts            PATCH  /api/columnist/posts/:id
DELETE /api/columnist/posts/:id        POST   /api/columnist/posts/:id/submit
PATCH  /api/columnist/profile
```

## Media (Cloudinary)

Covers, photos inside the text, author photos, videos and PDF attachments are
stored in Cloudinary. The `media` table is the index: who uploaded what, and
what uses it.

### Setting it up

1. Create a Cloudinary account. In the console, **Settings → API Keys**, copy
   the *API environment variable*: `cloudinary://<key>:<secret>@<cloud_name>`.
2. Put it in `backend/.env` as `CLOUDINARY_URL`.
3. **Settings → Security → "Allow delivery of PDF and ZIP files"**: turn it on.
   Without it, Cloudinary answers 401 for every PDF link.

### How a file gets in

```
panel ── POST /api/media/signature {purpose} ──▶ API
panel ◀── uploadUrl + signed fields ──────────── API   (folder, id, formats, overwrite=0)
panel ── the file ──────────────────────────────▶ Cloudinary   (never through Express)
panel ◀── public_id, version, signature ───────── Cloudinary
panel ── POST /api/media {…Cloudinary's answer} ▶ API   (checks Cloudinary's signature)
```

The API secret never leaves the server. Everything the browser sends to
Cloudinary is covered by the signature, so it cannot choose another folder,
another format or overwrite a published file. Cloudinary signs its answer
(`public_id` + `version`) with the same secret, which is how the API knows an
upload really happened without calling Cloudinary.

A pasted image link is copied into Cloudinary (`POST /api/media/import`), so a
post never depends on someone else's site keeping the picture online.

### Purposes

| purpose | kind | formats | max | min width |
|---|---|---|---|---|
| `cover` | image | jpg png webp avif heic | 10 MB | 800 px |
| `body` (photo in the text) | image | same | 10 MB | 400 px |
| `author` | image | same | 10 MB | 200 px |
| `video` | video | mp4 mov webm m4v | 100 MB | — |
| `document` | PDF | pdf | 10 MB | — |

Limits match Cloudinary's free plan. `.mov` from a phone is fine: delivery
URLs ask for mp4 (`q_auto/….mp4`), and Cloudinary converts it.

### URLs

Never stored. `media.urls.ts` builds them from `publicId` + `version` +
`format`, so changing a size is a code change, not a migration:

- images: `f_auto,q_auto,c_limit,w_<480|800|1200|1600>` in a `srcset`
- author photo: `c_thumb,g_face,w_256,h_256` (square, centred on the face)
- video: mp4 plus a poster frame (`so_0`)
- PDF: the file, plus page 1 as a thumbnail (`pg_1`)

Photos inside the text are `<img>` tags in the HTML. The sanitizer keeps an
`<img>` only if it points at our Cloudinary account and folder, and rewrites it
with a `srcset` and `loading="lazy"`. Images from anywhere else are dropped.

### Video

One per post: a YouTube link **or** an uploaded file. The API takes
`video: { provider: 'youtube', url } | { provider: 'cloudinary', mediaId } | null`
and the CHECK constraint `posts_single_video` refuses both at once. For
YouTube only the 11-char id is stored; the template builds the player and an
`<iframe>` is never accepted from the editor.

### Credits

The free plan has 25 credits a month, shared: 1 credit = 1 GB stored, or 1 GB
delivered, or 1,000 transformations, or about 4 minutes of HD video
conversion. Video is what spends them fastest. The usage page in the console
shows where they go.

### Deleting

`DELETE /api/media/:id` (admin) removes the file from Cloudinary and from the
table, and refuses while a post or a profile uses it — photos inside the text
included.

## Still open

- Edge caching of public routes (`/api/home`, `/api/posts/...`) in the
  Worker, once the site is on its own domain (the Cache API does nothing on
  `workers.dev`). A viral article would otherwise land on the API.
- Redirects from old addresses. A post's address follows its headline only
  until the first publication; a category's or author's follows the name when
  it was made from it. Links to the old address of a renamed category or
  author stop working.
- The Quill `formats` whitelist in the panel must match `ALLOWED_TAGS` in
  `shared/utils/sanitizeHtml.ts`.
- Do not enable alignment, indent, colour or size in the editor toolbar: Quill
  exports those as CSS classes, which look right in the panel and arrive
  unstyled on the public site.
