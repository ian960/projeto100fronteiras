# Going live

```
reader ──▶ portal100fronteiras.com.br (Cloudflare DNS only, grey cloud)
              │
              ▼
           Render: portal-api (backend/) ──▶ Render: Postgres
              │  /api/*             the API
              │  /noticia/:slug...  pages with link preview tags, sitemaps,
              │                     robots.txt (frontend/worker/routes.ts)
              │  everything else    the site's files (frontend/dist)
              ▼
           Cloudinary: images, videos and PDFs (straight from the browser)

Cloudflare Worker (projeto-sem-fronteiras.<account>.workers.dev): the same
site on a second address, and every 10 minutes a ping that keeps the free API
awake.
```

**Why not Cloudflare for the domain:** TIM (and other Brazilian ISPs) block
some of Cloudflare's shared IPs in anti-piracy orders, and a free Cloudflare
zone cannot choose its IPs. On 2026-11-18 portal100fronteiras.com.br sat on
two blocked ones (104.21.20.81, 172.67.191.252) and did not open on TIM
fiber. So the domain points at Render and Cloudflare only answers its DNS.

The browser only ever talks to the site's own address, and the API is on that
same address, so the login cookie is first-party: with the site and the API on
two different domains, Safari would block the cookie and nobody could log in
from an iPhone.

| | plan | limit to know |
|---|---|---|
| Cloudflare Workers | free | 100,000 Worker requests a day (`/api/*` and article pages; plain files do not count) |
| Render web service | free | sleeps after 15 minutes without requests (the Worker pings it every 10); also serves the site |
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
     `https://projeto-sem-fronteiras.workers.dev` and fix it in step 3.
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
   - Project name: `projeto-sem-fronteiras` (must match `name` in `wrangler.jsonc`)
   - Production branch: `master`
   - Root directory: `frontend`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
3. **Save and Deploy.** Then, in the Worker: **Settings → Variables and
   Secrets → Add → Secret**, name `PROXY_SECRET`, value copied from Render.
4. The site's address is under **Settings → Domains & Routes**
   (`https://projeto-sem-fronteiras.<your-account>.workers.dev`).

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

## 5. Demo content (optional, for presenting)

The site can start with the same demo stories as development, and lose them
in one command when real work begins. From the repository root on your
computer, with the external URL from step 4 and the admin created there:

```bash
docker compose run --rm \
  -e DATABASE_URL="<external URL>?sslmode=require" \
  -e DEMO_SITE_URL="https://projeto-sem-fronteiras.<your-account>.workers.dev" \
  -e SEED_ADMIN_EMAIL="you@example.com" \
  -e SEED_ADMIN_PASSWORD="the admin's password" \
  api npm run db:demo
```

To take it out, the same command ending in `db:demo:remove`. It removes the
four demo bylines and everything they sign, the two `@demo.local` accounts,
their pictures (from Cloudinary too) and the demo categories with nothing
else in them. Real stories stay, as long as nobody signs one with a demo
byline.

`db:demo` only fills an empty database, so it never duplicates anything. Both
refuse when the database and the site address do not belong together.

## 6. Check

- The site opens, and so does `/api/health` on the site's address.
- Log in on the panel (also on an iPhone).
- Publish a test article with a cover, open it, and paste its link in a
  WhatsApp chat: the preview shows the headline and the cover.

## Day to day

- **Push to `master`** and both redeploy: Render builds the API, applies
  migrations and restarts; Cloudflare builds and publishes the site.
- **Logs:** Render → `portal-api` → Logs. Cloudflare → the Worker → Logs.
- **"O servidor não está respondendo" / 502**: Render is deploying or waking up.

## Before day 30

Render → `portal-db` → **Upgrade** to Basic-256mb. Same database, same data,
nothing to change in the code. Free databases are deleted 14 days after
expiring.

## The domain (portal100fronteiras.com.br)

The domain's DNS is on Cloudflare, but the records are **DNS only** (grey
cloud), pointing at Render:

1. Render → `portal-api` → **Settings → Custom Domains → Add**:
   `portal100fronteiras.com.br` (Render adds `www` and redirects it).
2. Cloudflare → the domain → **DNS**, records as Render shows them, all with
   the cloud **grey** (DNS only):
   - `A` `@` → `216.24.57.1`
   - `CNAME` `www` → `portal-api-o5v4.onrender.com`
3. Back on Render, **Verify**. The https certificate comes in a few minutes.
4. `SITE_URL` on Render stays `https://portal100fronteiras.com.br`.

An orange cloud would put the site back on Cloudflare's shared IPs.
