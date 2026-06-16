# Vaasenk — Production Deployment Runbook

> Single source of truth for shipping Vaasenk to production.
> Targets (from `CLAUDE.md` §2 locked decisions):
> **Web → Vercel · API + Worker → Railway (Docker) · Mobile → EAS Build.**
> Data plane: **Supabase** (Postgres + pgvector + Auth + Storage) and **Redis** (BullMQ).

---

## ⚠️ Honesty banner — what is and isn't proven

**PROVEN locally (actually executed, not assumed):**
- **`prisma migrate deploy`** against a fresh empty pgvector Postgres → 27 tables + the `vector`
  extension (self-bootstrapped) + the HNSW index; `migrate status` clean; idempotent on re-run.
- **The API Docker image** (`apps/api/Dockerfile`) — `docker build` succeeds and `docker run`
  boots far enough to resolve `@vaasenk/ai` and reach the DB connection (it fail-hards there with
  no DB, as designed). Building it surfaced and fixed three real Dockerfile bugs (a `.dockerignore`
  that hid the web/mobile manifests, per-workspace `node_modules` copies that don't exist under npm
  hoisting, and `@vaasenk/ai` never being built/shipped). So the image is build-and-boot verified.

**NOT proven (no Vercel / Railway / EAS accounts at authoring time):** the platform wiring itself —
the Vercel monorepo build, the Railway service/context/`$PORT` setup, and EAS. **Treat the first
real deploy as the integration test** for those.

The three places an integration-shaped failure is **most likely** on first deploy — verify each
explicitly (details inline below):

1. **Vercel monorepo build command** — whether Vercel installs from the repo root so the
   `@vaasenk/ui` + `@vaasenk/shared-types` workspace symlinks resolve. (§ Web)
2. **Railway Docker build context** — whether Railway builds with the **repo root** as the Docker
   context (so `COPY packages/...` in `apps/api/Dockerfile` succeeds). Setting the service Root
   Directory to `apps/api` **WILL break the build.** (§ API)
3. **The `$PORT` binding** — whether the API actually binds the port Railway injects, and whether
   the `/health` healthcheck passes within the timeout. (§ API)

---

## 0. Prerequisites (one-time)

- Accounts: **Vercel**, **Railway**, **Expo (EAS)**, **Supabase**.
- CLIs: `vercel`, `railway`, `eas-cli` (`npm i -g eas-cli`), `npx prisma` (already a repo dep).
- The repo builds clean locally first: from the repo **root**, `npm install` then
  `npx turbo run lint typecheck build` → must be all green. **Always `npm install` at the root
  after cloning or moving the repo** (see the stale-symlink caveat at the bottom — it silently
  breaks every build otherwise).

---

## 1. Deployment order (do NOT reorder)

The order matters: the schema must exist before the API boots (the API fail-HARDs in production if
the DB is unreachable — see `main.ts` / `PrismaService`), and the web + mobile clients need the
API URL before they can be built with the right `*_API_URL` baked in.

```
1. Provision Supabase   → get DATABASE_URL (pooled :6543), DIRECT_URL (direct :5432),
                          SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
2. Provision Redis      → get REDIS_URL  (Railway Redis plugin, or Upstash)
3. Run DB migration     → prisma migrate deploy  (creates 27 tables + pgvector + HNSW)
4. Deploy API           → Railway service #1 (Docker, repo-root context)  → get its public URL
5. Deploy Worker        → Railway service #2 (SAME image, start = node dist/main.worker.js)
6. Deploy Web           → Vercel (NEXT_PUBLIC_API_URL = the Railway API URL from step 4)
7. Build Mobile         → eas build (EXPO_PUBLIC_API_URL = the Railway API URL from step 4)
```

After step 4, set the API's `WEB_APP_URL` and (optionally) `CORS_ORIGINS` to the Vercel domain
once it exists (chicken-and-egg: deploy web first with a placeholder, then update the API env, or
use a known custom domain from the start). The API already allows any `*.vercel.app` origin by
default (see `main.ts` CORS), so preview deploys work without extra config.

---

## 2. Step-by-step

### Step 1 — Supabase (Postgres + pgvector + Auth + Storage)

1. Create a Supabase project. Region close to your users (India → Mumbai / Singapore).
2. **Project Settings → Database** → copy two connection strings:
   - **Pooled** (Transaction mode, port **6543**) → this is `DATABASE_URL` (runtime / `@prisma/client`).
   - **Direct** (Session mode, port **5432**) → this is `DIRECT_URL` (migrations; Prisma cannot
     migrate through pgbouncer).
   - Append `?sslmode=require` to both (Supabase requires TLS).
3. **Project Settings → API** → copy `SUPABASE_URL`, `SUPABASE_ANON_KEY` (= the public anon JWT,
   also used as `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`), and
   `SUPABASE_SERVICE_ROLE_KEY` (server-only — **never** ship to a client).
4. **Storage** → create the buckets the API writes to (notes, syllabus, sample-papers, papers).
   Paths follow `CLAUDE.md` §3 rule 5: `/{institution_id}/{entity_type}/{entity_id}/{filename}`.
5. `pgvector`: **no manual step.** The baseline migration enables the extension and creates the
   HNSW index itself (see Step 3). If your Supabase plan gates extensions, confirm `vector` is
   allowed (it is on all standard plans).

### Step 2 — Redis (BullMQ)

- Easiest: add the **Redis** plugin inside the same Railway project (Railway exposes `REDIS_URL`
  to services in the project). Alternatively use **Upstash Redis** and copy its `rediss://` URL.
- Both the **API** and the **Worker** need `REDIS_URL` (the worker drains the queues; the API
  enqueues + runs in-process processors for now).

### Step 3 — Run the database migration (BEFORE deploying the API)

The baseline migration `packages/db/prisma/migrations/20260101000000_init/` is the proven,
single-migration baseline: it creates all **27 core tables + the `vector` extension + the HNSW
index** on `vector_embeddings.embedding`. `prisma migrate deploy` applies it idempotently — it
never resets data and is safe to re-run (already-applied migrations are skipped).

Run it from a machine that can reach Supabase (your laptop, or a Railway one-off shell), with
`DIRECT_URL` pointed at the **direct** (port 5432) connection string:

```bash
# from the repo root, with DATABASE_URL + DIRECT_URL exported (or in packages/db/.env)
npm install                                            # ensure workspace symlinks (see caveat)
npm run db:migrate:deploy --workspace=@vaasenk/db
# equivalently: cd packages/db && npx prisma migrate deploy --schema=./prisma/schema.prisma
```

- This **self-bootstraps pgvector** — the migration SQL runs `CREATE EXTENSION IF NOT EXISTS vector`
  and the `CREATE INDEX ... USING hnsw`. No manual `CREATE EXTENSION` needed.
- Verify: `npx prisma migrate status --schema=packages/db/prisma/schema.prisma` should report the
  database is **up to date** with `20260101000000_init` applied.
- ⚠️ If you point `DIRECT_URL` at the pooled (6543) URL, the migration will fail or hang — pgbouncer
  cannot run migrations. Use the **direct 5432** string for `DIRECT_URL`.

> Optional: this migration is also the right gate to put into a Railway "release command" or a CI
> step so every deploy runs `migrate deploy` automatically. For the first manual deploy, run it by
> hand as above so you can read the output.

### Step 4 — Deploy the API (Railway service #1, Docker)

**Critical: the Docker build context MUST be the monorepo root.** `apps/api/Dockerfile`
`COPY`s `packages/*` and `apps/api` (its header documents `docker build -f apps/api/Dockerfile .`
run from the repo root). The repo-root `railway.json` encodes this:

```json
{ "build": { "builder": "DOCKERFILE", "dockerfilePath": "apps/api/Dockerfile" },
  "deploy": { "startCommand": "node dist/main.js", "healthcheckPath": "/health", ... } }
```

Dashboard settings that **cannot** live in the config file — set these on the Railway service:

| Setting | Value | Why |
|---|---|---|
| **Source repo** | this repo | — |
| **Root Directory** | **`/` (repo root)** — leave EMPTY / `.` | If you set it to `apps/api`, the Docker context becomes `apps/api` and `COPY packages/...` **fails**. This is the #1 likely failure. |
| **Config-as-code path** | `railway.json` (repo root, auto-detected) | Provides builder + Dockerfile path + start command + healthcheck. |
| **Builder** | Dockerfile (from `railway.json`) | — |
| **Networking → Public Domain** | generate one | This URL becomes `NEXT_PUBLIC_API_URL` / `EXPO_PUBLIC_API_URL`. |

- **`$PORT`:** Railway injects `PORT` at runtime. The Dockerfile sets `ENV PORT=4000` as a default,
  and `main.ts` reads `PORT` from config (`config.get('PORT')`) and calls `app.listen(port)`. So
  Railway's injected `$PORT` is honored automatically — **do not hard-code 4000** in the Railway
  env if Railway sets its own `PORT`. ✅ **Verify on first deploy:** the service comes up and
  `https://<api-domain>/health` returns 200 within the 120s healthcheck window. If the healthcheck
  fails, check that the bound port equals `$PORT` (Railway's logs show the "listening on" line).
- **Health endpoint:** `/health` is excluded from the `/api/v1` global prefix (`main.ts` line 22),
  so it's a bare `GET /health`. That's the healthcheck path in `railway.json`.
- Set the API env vars (table in §3) on this service.

### Step 5 — Deploy the Worker (Railway service #2, SAME image)

The worker is the **same Docker image** with a different start command. It runs
`apps/api/src/main.worker.ts` → `dist/main.worker.js`, which uses
`NestFactory.createApplicationContext` (NO HTTP listener, NO `app.listen()`). Therefore it has
**no healthcheck path** — a healthcheck would never pass because nothing listens on a port.

> **Railway config-as-code limitation:** a single `railway.json` describes **one service**. It
> cannot express two services. So the worker is **NOT** in `railway.json` — create it manually:

1. In the **same Railway project**, **New Service → from the same repo**.
2. **Root Directory:** `/` (repo root) — same as the API, same reason.
3. **Build:** point it at the same Dockerfile. Two ways:
   - Simplest: in this service's settings, set the config path to `railway.json` too (it reuses the
     same Dockerfile build) and then **override the Start Command** (next line); **and remove /
     disable the healthcheck** for this service (set Healthcheck Path to empty in the dashboard).
   - Or give it its own `railway.worker.json` if you prefer separate config files (not created here
     to avoid two drifting Dockerfile references — the dashboard override is simpler).
4. **Start Command (override):** `node dist/main.worker.js`
5. **Healthcheck:** **none** (clear the path). The worker has no HTTP listener.
6. Env vars: it needs the **same** DB / Redis / Supabase / AI keys as the API (table in §3) — it
   runs the same `AppModule`. It does **not** need `PORT` or `WEB_APP_URL` to be set, but harmless
   if they are.

> Until traffic justifies the split (`CLAUDE.md` §2 says Sprint 4+), the API already runs the BullMQ
> processors in-process. You can **defer creating the worker service** and run everything on the API
> service alone — the queues still drain. Add the dedicated worker when queue load warrants it.

### Step 6 — Deploy the Web app (Vercel)

**Monorepo approach chosen: Vercel Root Directory = `apps/web`, with `apps/web/vercel.json`
overriding install + build to run from the repo root via turbo.** Rationale:

- The web app depends on `@vaasenk/ui` + `@vaasenk/shared-types` workspace packages. `next.config.ts`
  already lists them in `transpilePackages`, so Next transpiles them from source — **no pre-build of
  those packages is required.** But the **install must happen at the repo root** so the npm workspace
  symlinks (`node_modules/@vaasenk/*`) exist; a plain install inside `apps/web` would not create them.
- `apps/web/vercel.json` therefore sets `installCommand: "npm install --prefix ../.."` (install at
  root) and `buildCommand: "cd ../.. && npx turbo run build --filter=@vaasenk/web"` (build via turbo
  from root so `^build` deps + caching + env passthrough all apply). `outputDirectory: ".next"`.
- We put `vercel.json` in **`apps/web/`** (not the repo root) because Vercel resolves `vercel.json`
  relative to the project **Root Directory**, and the cleanest monorepo setup points the project at
  `apps/web`. (A root `vercel.json` is also possible but then every command needs `apps/web` prefixes
  and Next.js auto-detection is muddier — the `apps/web` placement is the conventional Vercel-monorepo
  layout.)

Dashboard settings that **cannot** live in the config file — set these on the Vercel project:

| Setting | Value | Why |
|---|---|---|
| **Root Directory** | **`apps/web`** | Vercel runs from here; `vercel.json` is read relative to it; Next.js framework auto-detected. |
| **Include files outside Root Directory** | **ON** (default for monorepos) | Lets the build reach `../../packages/*` and the root `package-lock.json`. If your Vercel UI exposes this toggle, ensure it's on. |
| **Framework Preset** | Next.js | Matches `vercel.json` `"framework": "nextjs"`. |
| **Install Command** | inherited from `vercel.json` | `npm install --prefix ../..` |
| **Build Command** | inherited from `vercel.json` | `cd ../.. && npx turbo run build --filter=@vaasenk/web` |

- Set the web env vars (table in §3). `NEXT_PUBLIC_*` vars are baked into the browser bundle at
  build time, so **a rebuild is required if you change them.**
- ✅ **Verify on first deploy:** the build log shows turbo building `@vaasenk/web` (and its `^build`
  deps) from the repo root, and the deployed site can reach the Railway API (`NEXT_PUBLIC_API_URL`
  correct, CORS passes — the API allows `*.vercel.app` by default). If the build errors with
  `Can't resolve '@vaasenk/ui'` or `Cannot find module '@vaasenk/shared-types'`, the install did
  **not** run at the repo root — re-check `installCommand` / Root Directory (this is the most likely
  Vercel failure).

### Step 7 — Build the Mobile app (EAS)

1. **`eas init`** (a human step) — from `apps/mobile/`. This creates the EAS project and
   **populates `app.json` → `expo.extra.eas.projectId`** (currently `""`). `eas.json` deliberately
   does **not** hard-code a projectId — EAS resolves it from `app.json` after `eas init`. Commit the
   updated `app.json`.
2. **Env vars per profile.** `eas.json` defines `development`, `preview`, `production`, each with
   `EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`. These are
   public-by-design (bundled into the JS). The committed values are **placeholders** — replace them
   with the real Railway API URL (from Step 4) and the Supabase project URL/anon key, **or** move
   them to EAS-managed environment variables and reference those (recommended so staging vs prod URLs
   live in EAS, not git):
   ```bash
   # set once per environment, then remove the literal from eas.json's env block:
   eas env:create --environment production --name EXPO_PUBLIC_API_URL --value https://api.vaasenk.com
   eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value https://<proj>.supabase.co
   eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon-key>
   ```
3. **(Optional) `EXPO_ACCESS_TOKEN`** — only needed on the **API** side when the Expo project has
   "Enhanced push security" enabled (so the API authenticates its push sends). It is **not** an EAS
   build-time var. Leave unset for unauthenticated push (fine at small scale).
4. **Assets caveat:** `app.json` references `./assets/icon.png`, `splash.png`, `adaptive-icon.png`,
   `favicon.png` — these are **stubs / not committed**. `expo start` works without them but
   `eas build` may fail on missing assets. Drop real brand assets in `apps/mobile/assets/` first.
5. Build:
   ```bash
   cd apps/mobile
   eas build --profile development --platform android   # internal dev client (apk)
   eas build --profile preview     --platform ios       # internal testers
   eas build --profile production  --platform all       # store builds
   ```
   `development`/`preview` are `distribution: internal`; `production` builds for the stores. A
   **development build** (not Expo Go) is required for `react-native-pdf`, `expo-camera`, and push
   notifications — they're native modules Expo Go can't host.
6. **Push notifications** won't actually deliver until `eas init` has populated the projectId (the
   mobile push-registration code short-circuits to "skipped" when projectId is empty — by design).

---

## 3. Environment-variable matrix (which service needs which var)

`✓ = required · (opt) = optional · — = not used`. Source values from `.env.example`.

| Variable | API (Railway) | Worker (Railway) | Web (Vercel) | Mobile (EAS) | Migration (Step 3) |
|---|:---:|:---:|:---:|:---:|:---:|
| `NODE_ENV=production` | ✓ | ✓ | ✓ (Vercel sets it) | — | — |
| `DATABASE_URL` (pooled :6543) | ✓ | ✓ | — | — | ✓ |
| `DIRECT_URL` (direct :5432) | (opt)¹ | (opt)¹ | — | — | ✓ **(must be direct)** |
| `SUPABASE_URL` | ✓ | ✓ | — | — | — |
| `SUPABASE_ANON_KEY` | ✓ | (opt) | — | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | — | — | — |
| `REDIS_URL` | ✓ | ✓ | — | — | — |
| `OPENAI_API_KEY` | ✓ | ✓ | — | — | — |
| `ANTHROPIC_API_KEY` | ✓ | ✓ | — | — | — |
| `EXPO_ACCESS_TOKEN` | (opt)² | (opt)² | — | — | — |
| `WEB_APP_URL` | ✓³ | — | — | — | — |
| `CORS_ORIGINS` | (opt)⁴ | — | — | — | — |
| `PORT` | Railway injects⁵ | — | — | — | — |
| `NEXT_PUBLIC_SUPABASE_URL` | — | — | ✓ | — | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | — | — | ✓ | — | — |
| `NEXT_PUBLIC_API_URL` | — | — | ✓ | — | — |
| `EXPO_PUBLIC_API_URL` | — | — | — | ✓ | — |
| `EXPO_PUBLIC_SUPABASE_URL` | — | — | — | ✓ | — |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | — | — | — | ✓ | — |

¹ `DIRECT_URL` is consumed by Prisma migrations (Step 3). The running API/worker use `DATABASE_URL`.
  Set `DIRECT_URL` on the API service too **only if** you run `migrate deploy` as a Railway release
  command from that service; otherwise it's just needed wherever you run Step 3.
² `EXPO_ACCESS_TOKEN` only when Expo "Enhanced push security" is on (API attaches it on push sends).
³ `WEB_APP_URL` is the password-reset redirect target (`/auth/forgot-password`). Set to the Vercel
  domain once it exists. Defaults to `http://localhost:3000` if unset (wrong for prod).
⁴ `CORS_ORIGINS` is extra allowed origins beyond `localhost:3000` + `*.vercel.app` (already allowed
  by default). Add a custom production web domain here if you use one.
⁵ Don't manually set `PORT` if Railway injects its own — let `main.ts` read Railway's `$PORT`.

---

## 4. The migrate command (reference)

```bash
# Self-bootstraps pgvector + creates 27 tables + the HNSW index. Idempotent.
npm run db:migrate:deploy --workspace=@vaasenk/db
#   → prisma migrate deploy --schema=./prisma/schema.prisma
# Requires DIRECT_URL pointed at the DIRECT (5432) Supabase connection, NOT the pooled 6543 one.
# Verify:
npx prisma migrate status --schema=packages/db/prisma/schema.prisma
```

---

## 5. Known caveats / first-deploy verification checklist

- [ ] **Stale workspace symlinks after a folder move** (the documented repo landmine). npm workspace
      symlinks in `node_modules/@vaasenk/*` keep pointing at the OLD absolute path after the repo is
      moved/cloned, so builds fail with `Can't resolve '@vaasenk/ui/...'` / `Cannot find module
      '@vaasenk/ai'`. **Fix: run `npm install` at the repo root.** Beware: turbo may serve a CACHED
      green build that masks this — always reinstall at root before trusting a build. (Vercel's
      install-at-root command handles this in CI; locally, do it by hand.)
- [ ] **Vercel:** build installs from the repo root (symlinks resolve) and turbo builds `@vaasenk/web`.
      Most likely failure: `@vaasenk/ui` / `@vaasenk/shared-types` not found → install didn't run at
      root → re-check `installCommand` + Root Directory.
- [ ] **Railway API:** Root Directory is the **repo root** (NOT `apps/api`) so `COPY packages/...`
      works. Most likely failure: Docker `COPY` fails because context was set to `apps/api`.
- [ ] **Railway `$PORT`:** API binds Railway's injected `$PORT`, and `GET /health` returns 200 within
      120s. Most likely failure: healthcheck timeout because the port binding or DB connection blocks
      boot (the API fail-HARDs if the DB is unreachable in production — confirm Step 3 ran and
      `DATABASE_URL` is correct).
- [ ] **Railway Worker:** second service, start `node dist/main.worker.js`, **healthcheck cleared**
      (no HTTP listener). It must NOT have a healthcheck path or it will be marked unhealthy forever.
- [ ] **DB migration ran BEFORE the API booted** (the API needs the schema to exist).
- [ ] **EAS:** `eas init` populated `app.json` → `extra.eas.projectId` (was `""`). `eas.json` has no
      hard-coded projectId by design. Brand assets exist in `apps/mobile/assets/` before `eas build`.
- [ ] **`*_PUBLIC_*` env changes need a rebuild** on both Vercel (Next.js) and EAS (Expo) — they're
      baked into the client bundle at build time, not read at runtime.

---

## 6. Files in this deploy setup

| File | Purpose |
|---|---|
| `apps/web/vercel.json` | Vercel project config — framework nextjs, install + build from repo root via turbo so workspace deps resolve. |
| `railway.json` (repo root) | Railway **API** service — Dockerfile builder, `dockerfilePath: apps/api/Dockerfile`, start `node dist/main.js`, healthcheck `/health`. (Build context = repo root.) |
| `apps/mobile/eas.json` | EAS Build profiles — `development` / `preview` (internal) + `production`, with `EXPO_PUBLIC_*` env wiring per profile. No hard-coded projectId. |
| `DEPLOY.md` (this file) | The runbook: order, dashboard-only settings, env matrix, migrate command, caveats. |

The **Railway Worker** service is intentionally NOT a config file (one `railway.json` = one
service); it's a dashboard-created second service documented in §2 Step 5.
