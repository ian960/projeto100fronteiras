# Going live

```
reader ──▶ Cloudflare ── site files (frontend/dist)
              │  Worker (frontend/worker/index.ts)
              │    /api/*            ──▶ Render: API (backend/) ──▶ Render: Postgres
              │    /noticia/:slug     link preview tags
              │    every 10 minutes   keeps the free API awake
              ▼
           Cloudinary: images, videos and PDFs (straight from the browser)
```

The browser only ever talks to the Cloudflare address. The Worker forwards
`/api/*` to Render, so the login cookie belongs to the site's own address:
with the site and the API on two different domains, Safari would block the
cookie and nobody could log in from an iPhone.

| | plan | limit to know |
|---|---|---|
| Cloudflare Workers | free | 100,000 Worker requests a day (`/api/*` and article pages; plain files do not count) |
| Render web service | free | sleeps after 15 minutes without requests (the Worker pings it every 10) |
| Render Postgres | free | **deleted 30 days after creation**, no backups: upgrade before that (Basic, US$ 6/month) |
| Render bandwidth | Hobby workspace | 5 GB/month out of Render (images and videos come from Cloudinary, not Render) |

## Before you start

- **GitHub.** Render and Cloudflare each install an app on the GitHub account
  that owns the repository. The repository is under `ian960`, so Ian (or
  whoever is admin of the repository) does the "connect GitHub" step.
- **Cloudinary.** In the console: Settings → Security → turn on "Allow
  delivery of PDF and ZIP files". Production files go to the `portal` folder,
  development ones to `portal-dev`.

## 1. Render: API and database

1. Render Dashboard → **New → Blueprint** → pick the repository, branch
   `master`. Render reads `render.yaml` and shows `portal-api` and `portal-db`.
2. It asks for two values:
   - `CLOUDINARY_URL`: the "API environment variable" from Cloudinary.
   - `SITE_URL`: the Cloudflare address. Not known yet: type
     `https://portal-sem-fronteiras.workers.dev` and fix it in step 3.
3. **Apply.** The first build takes a few minutes. When the service shows
   "Live", open `https://<service>.onrender.com/api/health`: it should answer
   `"environment":"production","uploads":"cloudinary"`.
4. Note two things from `portal-api`:
   - its address (top of the page). If it is not
     `https://portal-api.onrender.com`, put it in `frontend/wrangler.jsonc`
     (`API_ORIGIN`) and push.
   - **Environment → `PROXY_SECRET`**: copy the value.

## 2. Cloudflare: site and Worker

1. Cloudflare Dashboard → **Workers & Pages → Create application → GitHub**
   → pick the repository.
2. Settings:
   - Project name: `portal-sem-fronteiras` (must match `name` in `wrangler.jsonc`)
   - Production branch: `master`
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. **Save and Deploy.** Then, in the Worker: **Settings → Variables and
   Secrets → Add → Secret**, name `PROXY_SECRET`, value copied from Render.
4. The site's address is under **Settings → Domains & Routes**
   (`https://portal-sem-fronteiras.<your-account>.workers.dev`).

## 3. Back on Render

`portal-api` → **Environment** → set `SITE_URL` to the address from step 2.4.
Render redeploys by itself.

## 4. First admin

The database starts empty. From the repository root on your computer, with
the "External Database URL" from `portal-db` → **Connect**:

```bash
docker compose run --rm \
  -e DATABASE_URL="<external URL>?sslmode=require" \
  -e SEED_ADMIN_NAME="Elias" \
  -e SEED_ADMIN_EMAIL="you@example.com" \
  -e SEED_ADMIN_PASSWORD="a long password" \
  api npm run db:seed
```

The seed refuses to run against a database that is not on your machine
unless `SEED_ADMIN_PASSWORD` is set. If it fails with "self-signed
certificate", use `?sslmode=no-verify` instead of `?sslmode=require`.

## 5. Check

- The site opens, and so does `/api/health` on the site's address.
- Log in on the panel (also on an iPhone).
- Publish a test article with a cover, open it, and paste its link in a
  WhatsApp chat: the preview shows the headline and the cover.
- Calling the Render address directly (`/api/home`) answers 403: only the
  Worker gets in.

## Day to day

- **Push to `master`** and both redeploy: Render builds the API, applies
  migrations and restarts; Cloudflare builds and publishes the site.
- **Logs:** Render → `portal-api` → Logs. Cloudflare → the Worker → Logs.
- **"Acesse pelo endereço do site" / 403 from the API**: `PROXY_SECRET`
  differs between Render and Cloudflare.
- **"O servidor não está respondendo" / 502**: Render is deploying or waking up.

## Before day 30

Render → `portal-db` → **Upgrade** to Basic-256mb. Same database, same data,
nothing to change in the code. Free databases are deleted 14 days after
expiring.

## When the domain goes live

1. Add the domain to Cloudflare (it becomes the domain's DNS).
2. The Worker → **Settings → Domains & Routes → Add → Custom domain**.
3. Render → `SITE_URL` with the new address.

With a domain of its own, Cloudflare can also cache public pages at the edge
(the Cache API does nothing on `workers.dev`), which takes most of the load
off the API.
