# Site + panel for development: the Vite dev server, reloading on save.
# docker-compose.yml builds the `dev` stage and mounts frontend/ over /app.
# A production stage (static build behind nginx) comes with the deploy.

FROM node:24-bookworm-slim AS dev

WORKDIR /app
RUN chown node:node /app
USER node

# Dependencies first, in their own layer: editing code does not reinstall them.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .

EXPOSE 5173

# --host: listen on every interface. Vite's default (localhost) would only
# answer inside the container, and the browser on Windows could not reach it.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
