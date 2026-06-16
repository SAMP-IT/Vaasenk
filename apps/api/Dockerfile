# Vaasenk API — multi-stage Docker build.
#
# Build context: monorepo root (Railway is configured this way). We copy the
# whole workspace, install once, generate the Prisma client (required at
# build time because apps/api/src imports @prisma/client), then build the
# NestJS app. The final runner stage ships only the API's dist/, the
# generated @prisma/client, and a pruned production node_modules tree.
#
# Stages:
#   1. deps    — install all workspace dependencies (incl. dev) for build
#   2. builder — prisma generate + nest build (produces dist/main.js)
#   3. runner  — minimal production image; non-root; CMD node dist/main.js
#
# Build:  docker build -f apps/api/Dockerfile -t vaasenk-api .
# Run:    docker run -p 4000:4000 --env-file apps/api/.env vaasenk-api
#
# To run the worker entry point from the same image (see CLAUDE.md §2),
# override CMD: docker run ... vaasenk-api node dist/main.worker.js

# ---------- Stage 1: deps ----------------------------------------------------
FROM node:20-slim AS deps
WORKDIR /repo

# Install OpenSSL — required by Prisma engines on Debian slim.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace manifests first so the Docker layer cache hits when only
# source files change.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/mobile/package.json ./apps/mobile/
COPY packages/db/package.json ./packages/db/
COPY packages/ai/package.json ./packages/ai/
COPY packages/ui/package.json ./packages/ui/
COPY packages/shared-types/package.json ./packages/shared-types/

# Full install (workspaces). `--ignore-scripts` skips prisma generate here;
# we run it explicitly in the builder stage with the schema in place.
RUN npm ci --ignore-scripts

# ---------- Stage 2: builder -------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /repo

RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Bring installed node_modules from deps stage. npm workspaces HOIST every
# dependency into the single root /repo/node_modules (per-workspace
# node_modules dirs aren't created), so copying the root tree is sufficient —
# and copying non-existent per-workspace dirs would fail the build.
COPY --from=deps /repo/node_modules ./node_modules

# Copy source for the API + every workspace it depends on.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared-types ./packages/shared-types
COPY packages/ai ./packages/ai
COPY packages/ui ./packages/ui

# Generate Prisma client (apps/api/src imports @prisma/client at build time).
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma

# Build the NestJS app -> apps/api/dist/main.js. Use turbo (NOT a bare
# `npm run build --workspace=@vaasenk/api`) so the `^build` dependency builds
# @vaasenk/ai -> packages/ai/dist FIRST. apps/api/src imports `@vaasenk/ai` at
# runtime (it is NOT bundled — nest build is plain tsc), so its dist must exist
# both for this tsc build to resolve types AND at runtime (see the runner copy).
RUN npx turbo run build --filter=@vaasenk/api

# Prune dev dependencies for the final image.
RUN npm prune --omit=dev --workspaces

# ---------- Stage 3: runner --------------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app

# OpenSSL for Prisma engines at runtime.
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4000

# Non-root user.
RUN groupadd --system --gid 1001 vaasenk \
    && useradd --system --uid 1001 --gid vaasenk --create-home vaasenk

# Production node_modules from the pruned workspace install (hoisted to root).
COPY --from=builder --chown=vaasenk:vaasenk /repo/node_modules ./node_modules

# Built NestJS bundle.
COPY --from=builder --chown=vaasenk:vaasenk /repo/apps/api/dist ./dist
COPY --from=builder --chown=vaasenk:vaasenk /repo/apps/api/package.json ./package.json

# Prisma schema + generated client (Prisma reads schema at runtime for some ops).
COPY --from=builder --chown=vaasenk:vaasenk /repo/packages/db ./packages/db

# @vaasenk/ai (incl. its built dist/) — apps/api/dist `require('@vaasenk/ai')`
# at runtime resolves through the node_modules/@vaasenk/ai workspace symlink to
# ./packages/ai. Without this the API + worker crash with "Cannot find module".
COPY --from=builder --chown=vaasenk:vaasenk /repo/packages/ai ./packages/ai

USER vaasenk

EXPOSE 4000

# dumb-init handles PID 1 signal forwarding; CMD uses exec form.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
