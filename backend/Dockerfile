# API image for development. docker-compose.yml builds the `dev` stage and
# mounts backend/ over /app, so the code you edit is the code that runs.
# A production stage (compiled, no dev dependencies) comes with the deploy.

FROM node:24-bookworm-slim AS dev

# The Prisma CLI (migrate, generate) picks its engine by the OpenSSL version,
# and the slim image has none installed.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first, in their own layer: editing code does not reinstall them.
# They are Linux builds (argon2 is native), which is why the Windows
# node_modules can never be used in here.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

EXPOSE 3333

# 1. Prisma Client from the current schema (src/generated is not in git).
# 2. Apply migrations nobody has applied yet. `deploy` never creates or
#    resets anything; new migrations are made with `npm run db:migrate`.
# 3. The API with reload on save.
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && exec npm run dev"]
