# syntax=docker/dockerfile:1.7
#
# ============================================================================
# PRODUCTION-ONLY image for futebol-back.
#
# Local dev is Docker-free by design: `pnpm dev` (tsx watch src/server.ts)
# reads `.env` and talks directly to Neon (managed Postgres) — there is no
# dev Dockerfile and no docker-compose.yml (removed on purpose, do not
# recreate it). This Dockerfile exists ONLY to run the already-BUILT server
# (`node dist/server.js`) against a real `DATABASE_URL` (Neon) injected as a
# plain env var at runtime — no `.env` file ships in any image here.
#
# Build the app image:
#   docker build -f docker/Dockerfile -t futebol-api .
#
# Run it:
#   docker run --rm -p 3333:3333 \
#     -e DATABASE_URL='postgresql://user:pass@ep-xxx.neon.tech/futebol?sslmode=require' \
#     -e JWT_ACCESS_SECRET=... -e JWT_REFRESH_SECRET=... -e GOOGLE_CLIENT_IDS=... \
#     futebol-api
#
# Migrations: the `runtime` stage is Google's distroless nodejs image, which
# has NO shell — `prisma migrate deploy` can never run in its CMD. Instead,
# migrations are a SEPARATE release step using the `migrate` stage below
# (built from plain node:22-bookworm-slim, which still has /bin/sh). Run it
# in CI/CD BEFORE rolling out a new `runtime` image:
#   docker build -f docker/Dockerfile --target migrate -t futebol-migrate .
#   docker run --rm -e DATABASE_URL='postgresql://...' futebol-migrate
# `docker build` with no --target only builds `runtime` (and the stages it
# depends on) — `migrate` is never built unless explicitly targeted.
# ============================================================================

# ---------- Stage 1: deps (fetch, cacheable) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
COPY package.json pnpm-lock.yaml .npmrc ./
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm fetch --frozen-lockfile

# ---------- Stage 2: build ----------
# Full install (incl. devDependencies: the `prisma` CLI, `tsup`, `typescript`)
# so both `prisma generate` and `tsup` can run.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
COPY --from=deps /app /app
COPY . .
RUN pnpm install --frozen-lockfile --offline
# Prisma 7, `generator client { engineType = "client" }`: produces a pure
# JS/TS client at src/generated/prisma (gitignored, not in the repo) — no
# Rust query-engine binary to ship, but it must be generated during the
# image build since it doesn't exist in source control.
# `prisma.config.ts` eagerly resolves `env("DATABASE_URL")` just to LOAD the
# config (Prisma 7 removed automatic .env loading), even for `generate`,
# which never actually connects to a database — a placeholder value
# satisfies that check. The real DATABASE_URL is only ever supplied at
# `docker run` time (runtime stage) / to the `migrate` stage below.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm prisma generate
# tsup (see tsup.config.ts) bundles src/server.ts into a single dist/server.js.
# tsup's default: anything in package.json "dependencies" stays EXTERNAL
# (required from node_modules at runtime); local source — including the
# generated Prisma client at src/generated/prisma, which isn't a node_modules
# package — gets fully inlined. Verified by actually running dist/server.js:
# every import resolves and a real `prisma.user.findUnique()` call is
# reached (see the `docker run` smoke test in the commit message).
RUN pnpm build

# ---------- Stage 3: runtime-deps (lean prod-only node_modules) ----------
# `@prisma/client` declares an OPTIONAL peerDependency on the `prisma` CLI
# package. Because `prisma` is ALSO our own devDependency (needed above for
# `prisma generate`), pnpm's lockfile permanently peer-links @prisma/client
# to it — so `pnpm prune --prod` on the `build` stage's node_modules does
# NOT drop the CLI's own heavy deps (@prisma/studio-core, effect,
# @electric-sql/pglite, a bundled typescript-linux-x64 binary, ...): ~230MB
# of dead weight the runtime app never imports.
# Fix: install runtime deps FRESH from an isolated manifest containing only
# package.json's "dependencies" (no "prisma" anywhere in this manifest, so
# there's nothing for @prisma/client's optional peer to link against).
FROM node:22-bookworm-slim AS runtime-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.26.0 --activate
COPY package.json ./root-package.json
RUN node -e "\
  const fs = require('node:fs'); \
  const pkg = JSON.parse(fs.readFileSync('root-package.json', 'utf8')); \
  fs.writeFileSync('package.json', JSON.stringify({ \
    name: pkg.name + '-runtime', \
    private: true, \
    dependencies: pkg.dependencies, \
    pnpm: { onlyBuiltDependencies: ['argon2'] }, \
  }, null, 2)); \
  " \
  && rm root-package.json
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --prod --config.auto-install-peers=false

# ---------- Stage 4: migrate (release step image, NOT the app) ----------
# Branches off `build` (full node_modules incl. devDeps), so
# node_modules/.bin/prisma (a devDep) is present. `prisma.config.ts` supplies
# the datasource URL from the `DATABASE_URL` env var (Prisma 7 removed
# automatic .env loading + inline datasource.url) — pass it via
# `docker run -e DATABASE_URL=...`.
FROM node:22-bookworm-slim AS migrate
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
ENV NODE_ENV=production
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ---------- Stage 5: runtime (the app image) ----------
FROM gcr.io/distroless/nodejs22-debian12:nonroot AS runtime
WORKDIR /app

COPY --from=build --chown=nonroot:nonroot /app/dist ./dist
COPY --from=build --chown=nonroot:nonroot /app/package.json ./package.json
COPY --from=runtime-deps --chown=nonroot:nonroot /app/node_modules ./node_modules

USER nonroot
EXPOSE 3333

ENV NODE_ENV=production \
    NODE_OPTIONS="--enable-source-maps"

CMD ["dist/server.js"]
