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

Only `DATABASE_URL` is required. R2, `SESSION_SECRET` and the seed variables
all have development defaults, so the API runs before anyone has Cloudflare keys.

```bash
docker compose up -d            # from the repository root
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

### Without R2

Everything works except `/api/upload/*`, which answers
`503 SERVICE_UNAVAILABLE`. While uploads are off, any public image URL works as
a post cover. Fill in all five `R2_*` variables to turn uploads on; filling in
only some of them is rejected at boot.

### Manual testing

Import `docs/insomnia-portal.json` into Insomnia. Sessions are cookie-based:
log in once and Insomnia keeps and sends the cookie. There is no token to copy.

## Tests

```bash
npm run db:test:setup   # creates .env.test from .env and the _test database (idempotent)
npm test
```

The suite rebuilds the test database on every run by replaying the files in
`prisma/migrations`, so the hand-written SQL (CHECK constraints, the partial
unique index) is tested too. It refuses to run unless the database name ends in
`_test`.

`npm run typecheck` checks `src/`, `tests/` and `scripts/` — vitest does not
type-check, so this is the only place test types are verified.

## Production build

```bash
npm run build           # prisma generate + tsc -p tsconfig.build.json
npm start               # node dist/server.js
npm run db:deploy       # apply migrations on the server
```

The Prisma generator uses `moduleFormat = "cjs"`. Without it, the generated
client contains `import.meta.url`, which `tsx` tolerates in development but
crashes `node dist/server.js`.

## Architecture

```
src/
  config/      env (validated at boot), prisma, session, storage
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
POST   /api/upload/image               POST /api/upload/video-ticket
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

## Video

Two providers share one pair of columns:

- `youtube` — `videoUrl` holds the 11-char id, extracted from whatever link was
  pasted. The template builds the iframe; an `<iframe>` is never accepted from
  the editor.
- `r2` — mp4 only, 100 MB ceiling, uploaded straight from the browser with a
  pre-signed URL so a large file never passes through Express.

The pair is enforced by a CHECK constraint. Note the explicit
`video_provider IS NOT NULL` in it: without that, `NULL IN (...)` evaluates to
NULL, and Postgres lets a CHECK that is NULL pass.

mp4-only is not arbitrary: a phone recording in `.mov`/HEVC will not play in a
large share of browsers, and without transcoding that means publishing a black
rectangle.

## Still open

- Cloudflare in front of the domain, with `Cache-Control` on public routes.
  A viral article will take down a small VPS otherwise.
- The Quill `formats` whitelist in the panel must match `ALLOWED_TAGS` in
  `shared/utils/sanitizeHtml.ts`.
- Do not enable alignment, indent, colour or size in the editor toolbar: Quill
  exports those as CSS classes, which look right in the panel and arrive
  unstyled on the public site.
