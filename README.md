# Portal Sem Fronteiras

News portal: a public site for readers, a panel for the newsroom and the
columnists, and the API behind both.

| folder | what | details |
|---|---|---|
| `backend/` | API: Node, Express 5, Prisma 7, Postgres | [backend/README.md](backend/README.md) |
| `frontend/` | site + panel: React 19, Vite 8 | [frontend/README.md](frontend/README.md) |

## Running everything with Docker

Only Docker Desktop is needed. Node is optional (see "Without Docker" below).

### First time

```bash
cp .env.example .env                    # database password: letters and digits only
cp backend/.env.example backend/.env    # SESSION_SECRET, CLOUDINARY_URL
docker compose up                       # first run builds the images: a few minutes
```

When the API prints `API listening`, open a second terminal once to create the
first admin:

```bash
docker compose exec api npm run db:seed
```

| | address |
|---|---|
| site and panel | http://localhost:5173 (admin: `admin@portal.local` / `admin12345`) |
| API, for Insomnia | http://localhost:3333/api/health |
| Postgres, for DBeaver | `localhost:5433`, user and password from `.env` |

Ports can be changed in `.env` (`WEB_PORT`, `API_PORT`, `POSTGRES_PORT`).

### Day to day

| what | command |
|---|---|
| start | `docker compose up` (logs on screen, Ctrl+C stops) |
| start in the background | `docker compose up -d`, then `docker compose logs -f api web` |
| stop | `docker compose stop` |
| seed | `docker compose exec api npm run db:seed` |
| tests (first time) | `docker compose exec api npm run db:test:setup` |
| tests | `docker compose exec api npm test` |
| typecheck | `docker compose exec api npm run typecheck` and `docker compose exec web npm run typecheck` |
| new migration | `docker compose exec api npm run db:migrate -- --name what_changed` |
| add a package | `docker compose exec api npm install <package>` (or `web`) |
| after a `git pull` that changed a `package.json` | `docker compose up --build -V` |

**Never run `docker compose down -v`.** The `-v` deletes the database volume.
`docker compose down` (without `-v`) is safe.

### How it works

- **The code is not copied into the containers.** `backend/` and `frontend/`
  are mounted, so saving a file in VS Code reloads the API (tsx) or the page
  (Vite). Docker on Windows does not pass "file changed" events into a
  container, so both check the files every 300 ms instead (`CHOKIDAR_USEPOLLING`).
- **`node_modules` lives inside each container.** Packages are built for Linux
  there; argon2 is native code, so the Windows `node_modules` cannot be
  shared. That is why adding a package or pulling someone else's goes through
  the commands above.
- **The API applies pending migrations when it starts** (`prisma migrate
  deploy`). It never creates or resets anything; new migrations are made with
  `db:migrate`.
- **Addresses differ inside Docker.** The database is `db:5432` and the API is
  `api:3333`. `docker-compose.yml` passes those to the containers; everything
  else (secrets, Cloudinary) still comes from `backend/.env`.
- **Tests use their own database** (`<POSTGRES_DB>_test`), never the one you
  develop on.

## Without Docker

Still works: Postgres in Docker (`docker compose up -d db`), then API and site in
two terminals with Node 22.22 or newer. See the "Running locally" sections in
[backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).
