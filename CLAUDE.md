# CLAUDE.md — Vaasenk Project Intelligence

> This file is the single source of truth for every Claude Code session.
> Every agent reads this before writing any code.
> Updated by the human developer as architecture evolves.

---

## 1. Product Context

**Product:** Vaasenk — classroom productivity platform for Indian schools, colleges, and coaching centers.
**Core Promise:** Teachers photograph board notes → students stop copying. AI generates question papers and provides syllabus-grounded teaching assistance.
**Tagline:** "Teach more. Copy less."
**Target Market:** Tamil Nadu schools (Samacheer Kalvi), CBSE schools, coaching centers across India.

### Roles
| Role | Primary Device | Main Job |
|------|---------------|----------|
| Super Admin | Web | Platform management (Vaasenk team only) |
| Institution Admin | Web | Institution setup, users, syllabus, billing, AI config |
| Teacher | Mobile + Web | Upload notes, AI chatbot, generate question papers |
| Student | Mobile first | View notes, bookmark, download, ask doubts |

### Reference Documents (in this repo)
- `docs/Vaasenk_Web_App_PRD_v0.1.pdf` — Full web PRD with 21 sections
- `docs/Vaasenk_Mobile_App_PRD_v0.1.pdf` — Full mobile PRD with 19 sections
- `docs/Vaasenk_Role_Based_Feature_Flow_Spec_v0.1.pdf` — 63-page feature flow spec with acceptance criteria
- `docs/Vaasenk_Development_Playbook.md` — Sprint sequence and agent prompts
- `design-docs/Vaasenk_UI_UX_Design_Document_v0.1.pdf` — Complete design system spec
- `design-docs/README.md` — Design direction summary and usage guide
- `design-docs/vaasenk.tokens.json` — Platform-neutral design tokens
- `design-docs/vaasenk.theme.css` — CSS variables, classes, animations, component primitives
- `design-docs/vaasenk.tailwind.theme.css` — Tailwind v4 @theme tokens
- `design-docs/vaasenk.design-tokens.ts` — TypeScript token object for React
- `design-docs/vaasenk.native-theme.ts` — React Native / Expo tokens
- `design-docs/tailwind.config.vaasenk.ts` — Tailwind config extension

---

## 2. Architecture

### Monorepo Structure (Turborepo)
```
vaasenk/
├── apps/
│   ├── web/                  # Next.js 15, App Router, TypeScript, Tailwind v4
│   ├── mobile/               # Expo SDK 52+, TypeScript, NativeWind
│   └── api/                  # NestJS, TypeScript, Prisma ORM
├── packages/
│   ├── shared-types/         # Zod schemas + inferred TS types
│   ├── ui/                   # Design tokens + base components (web + mobile)
│   ├── db/                   # Prisma schema + migrations + seed
│   └── ai/                   # AI service abstractions (RAG, embeddings, chat)
├── infrastructure/
│   ├── docker-compose.yml    # Local dev: Postgres, Redis, MinIO
│   └── scripts/              # Setup, seed, migration scripts
├── docs/                     # PRDs, specs, playbook (READ-ONLY reference)
├── design-docs/              # Design tokens, themes, UI/UX spec (READ-ONLY reference)
└── CLAUDE.md                 # THIS FILE
```

### Locked Technical Decisions — DO NOT OVERRIDE
| Decision | Choice | Reason |
|----------|--------|--------|
| Auth | Supabase Auth | JWT + RLS + phone OTP, no custom auth build |
| Database | Supabase PostgreSQL + pgvector | Managed, auth integrated, vector search |
| File Storage | Supabase Storage | Signed URLs, image transforms, single dashboard |
| Backend Framework | NestJS | Modules, guards, interceptors, TS-native |
| ORM | Prisma | Type-safe queries, migrations, Supabase PG compatible |
| Background Jobs | BullMQ + Redis | Async AI processing, notifications, retries |
| AI Orchestration | LangChain.js (direct from NestJS) | NOT Flowise/Langflow — more control, less infra |
| AI Embeddings | OpenAI text-embedding-3-small | Best cost/quality for education content |
| AI Chat | Claude Sonnet or GPT-4o-mini | Quality vs cost per use case |
| Web Deployment | Vercel | Zero-config Next.js, preview deploys |
| API Deployment | Railway | Node.js + Redis + persistent workers |
| Mobile Build | EAS Build + EAS Update | OTA updates without app store review |
| Monorepo | Turborepo | Fast builds, shared packages |

**Worker topology.** BullMQ processors run in-process inside the main API (`apps/api`) for Sprint 0 / Sprint 1 — one Railway service, one image. A second entry point `apps/api/src/main.worker.ts` exists for the eventual split: when traffic justifies it (Sprint 4+), deploy the SAME Docker image as a separate Railway worker service with `CMD ["node", "dist/main.worker.js"]`. No HTTP listener in worker mode; processors drain queues directly.

---

## 3. Multi-Tenancy Rules — CRITICAL

These rules are NON-NEGOTIABLE. Enforce on EVERY query, EVERY endpoint, EVERY file operation.

1. Every database table with user data MUST have `institution_id` column
2. Every Prisma query MUST include `where: { institutionId }` filter
3. Every API endpoint MUST extract `institutionId` from JWT and pass to service layer
4. NEVER trust client-sent `institutionId` — always derive from authenticated token
5. File storage paths: `/{institution_id}/{entity_type}/{entity_id}/{filename}`
6. Vector store namespaces: `inst_{id}_syl_{syllabusId}`
7. Cross-institution data access = security vulnerability. Treat as P0 bug.

---

## 4. Design System — Mandatory Rules

### Brand Colors (from design-docs/vaasenk.tokens.json)
```
Vaasenk Red:     #A00000   — Primary CTA, active states, logo
Learning Gold:   #FECA02   — Highlights, badges, AI sparkle, progress
Deep Burgundy:   #5A0013   — Hero depth, AI panels
Warm Ember:      #FF6B1A   — Gradient transition, teacher cards
Rose Coral:      #FF5C7A   — Student cards, onboarding
Cream Canvas:    #FFF7EA   — Main page background (NOT white)
Soft Blush:      #FFF0F4   — Secondary panels
Ink Text:        #24161A   — Primary text
Muted Cocoa:     #7A6266   — Secondary text
Line Sand:       #EAD7CF   — Borders, dividers
Success Green:   #16A34A   — Completed, verified
Error Red:       #DC2626   — Failed, delete, danger
```

### Gradients
```css
Brand Flame:    linear-gradient(135deg, #A00000 0%, #D61F2C 45%, #FF7A1A 72%, #FECA02 100%)  /* Primary CTA, hero cards */
Deep AI Glow:   linear-gradient(135deg, #3B0010 0%, #780018 45%, #A00000 70%, #FF8A00 100%)  /* AI panels */
Cream Sunrise:  radial-gradient(circle at 20% 10%, rgba(254,202,2,.25) 0%, transparent 25%),
                linear-gradient(135deg, #FFF7EA 0%, #FFE3D2 45%, #FFF0F4 100%)               /* Page backgrounds */
Teacher Orange: linear-gradient(135deg, #A00000 0%, #FF7A1A 55%, #FECA02 100%)               /* Teacher cards */
Student Coral:  linear-gradient(135deg, #FF5C7A 0%, #FF8A4C 60%, #FECA02 100%)               /* Student cards */
Admin Royal:    linear-gradient(135deg, #5A0013 0%, #A00000 55%, #FFB000 100%)               /* Admin panels */
Glass Surface:  rgba(255, 255, 255, 0.72) + backdrop-filter: blur(20px)                      /* Cards on gradients */
```

### Component Rules
- **Always import tokens** from `packages/ui/tokens/` — NEVER hardcode colors, spacing, or radii
- **Cards:** rounded-[24px], shadow-soft on cream backgrounds
- **Buttons:** Primary = Brand Flame gradient + white text + rounded-full (999px)
- **Touch targets:** 44px minimum on mobile
- **Font:** Inter (web), system default (mobile) — never import decorative fonts
- **Glassmorphism:** `bg-white/72 backdrop-blur-[20px] border border-[#EAD7CF]`
- **Page backgrounds:** Cream Sunrise — never plain white
- **Gradients on text:** Only white text on gradient surfaces
- **Empty states:** Always include illustration placeholder + helpful CTA

### Role-Specific Design
- **Admin screens:** Admin Royal gradient headers, more data density allowed, sidebar nav
- **Teacher screens:** Teacher Orange headers, action-first (upload, generate, AI), minimal admin clutter
- **Student screens:** Student Coral headers, reading-focused, no teacher/admin actions visible

### What NOT To Do (from design docs)
- Do NOT make it look like a generic SaaS/CRM/ERP dashboard
- Do NOT use red and gold as loud political blocks — keep them tasteful
- Do NOT put long text on gradient surfaces
- Do NOT animate everything at once
- Do NOT use tiny sharp cards
- Do NOT overcrowd student screens
- Do NOT use dark mode as MVP default

---

## 5. Code Standards

### API Response Format
```typescript
// Success
{ data: T, meta?: { page: number, limit: number, total: number } }

// Error
{ error: { code: string, message: string, details?: any } }
```

### Input Validation
- Use **Zod** schemas in `packages/shared-types/` — shared between frontend and backend
- Backend DTOs use **class-validator** decorators (NestJS convention)
- File uploads: validate MIME type server-side, max 25MB, compress images >5MB

### Component State Contract
Every UI component MUST handle these states:
1. **Default** — normal interactive state
2. **Loading** — skeleton shimmer or spinner
3. **Empty** — friendly message + CTA (never blank page)
4. **Error** — red inline error + retry option
5. **Disabled** — grayed out with reason tooltip/text

### File Organization
```
apps/web/src/
  app/                    — Next.js App Router pages (route groups by role)
    (auth)/               — Login, register, forgot password
    (admin)/              — Admin pages
    (teacher)/            — Teacher pages  
    (student)/            — Student pages
  components/             — Page-specific components
  components/ui/          — ShadCN primitives (styled with Vaasenk tokens)
  lib/                    — API client, auth helpers, utilities
  hooks/                  — Custom React hooks

apps/api/src/
  modules/{name}/         — NestJS module (controller, service, dto, entity)
  common/                 — Guards, interceptors, filters, decorators
  workers/                — BullMQ worker processors
  config/                 — Environment validation and config

apps/mobile/src/
  screens/                — Screen components organized by role
  components/             — Reusable mobile components
  navigation/             — React Navigation config (role-based stacks)
  services/               — API client, storage, push notification
  hooks/                  — Mobile-specific hooks
```

### Git Conventions
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- Branch per feature: `feature/sprint-1-auth`, `feature/sprint-2-classrooms`
- PR per feature — never push directly to main
- Run `turbo lint && turbo typecheck` before every commit

---

## 6. AI Pipeline Rules

1. All AI calls go through `packages/ai/` service layer — apps NEVER call OpenAI/Anthropic directly
2. Every AI request MUST include: `institutionId`, `classroomId`, `syllabusId`, `userId`
3. RAG retrieval MUST filter by institution + classroom metadata namespace
4. AI responses MUST include source references (chapter/topic/page) when available
5. Always show disclaimer: *"AI can make mistakes. Verify important information."*
6. Track token usage per institution in `ai_usage_logs` table
7. Use streaming (SSE) for chat responses, polling for paper generation jobs
8. Prompt must instruct: "Answer ONLY from provided syllabus context. If not found, say so."
9. Sample papers guide pattern/importance — never blindly copy questions from them
10. Set hard monthly AI credit limits per institution plan

---

## 7. API Naming Conventions

```
GET    /api/v1/{resources}              — List (paginated)
GET    /api/v1/{resources}/:id          — Get one
POST   /api/v1/{resources}              — Create
PATCH  /api/v1/{resources}/:id          — Update
DELETE /api/v1/{resources}/:id          — Soft delete

Nested: /api/v1/classrooms/:id/notes    — Notes within classroom
Actions: /api/v1/question-papers/:id/generate  (POST)

All list endpoints: ?page=1&limit=20&sort=createdAt:desc&search=keyword
```

---

## 8. Sprint Tracker

Check the box when complete. Update this section as you progress.

- [x] **Sprint 0:** Monorepo + DB schema + Auth scaffolding + Docker + Deployment pipeline
- [x] **Sprint 1:** Admin auth + Institution setup wizard + User management
- [x] **Sprint 2:** Classroom CRUD + Notes upload + Student notes feed (CORE LOOP)
- [x] **Sprint 3:** Admin syllabus library + Sample paper library + PDF processing workers
- [x] **Sprint 4:** AI embeddings + pgvector + RAG chatbot for teachers
- [x] **Sprint 5:** Question paper generator (wizard + AI generation + PDF export)
- [x] **Sprint 6:** Notifications (in-app + WebSocket + push)
- [x] **Sprint 7:** Mobile app (Expo — student + teacher flows + push notifications)
- [x] **Sprint 8:** Admin dashboard + Subscription/billing tracking + Polish

**BUILD STATUS — corrected 2026-06-16 after a full, brutally-honest audit (code + forced clean builds + live Playwright boot).** The earlier "MVP COMPLETE — all 9 sprints shipped" claim was **OVERSTATED**. Accurate state:

- **Strong & verified (near production-quality):** Prisma schema (all MVP entities, every user-table tenant-scoped, indexed incl. pgvector HNSW); the AI pipeline (`packages/ai` — real OpenAI embeddings + pgvector cosine + Anthropic streaming, tenant-isolated at a single chokepoint, cost-tracked); and the NestJS backend (`apps/api` — real RAG / LLM paper-gen / PDF render / push / WebSocket / CSV import / image processing; **no multi-tenancy or RBAC holes found in audit**, though see "zero tests" below — "looks correct" ≠ "proven"). Mobile CODE is complete (camera quick-upload, AI chat, offline note viewer, all wired to the live API).
- **NOT done / load-bearing gaps (the product is NOT launch-ready):**
  - **No classroom-creation UI anywhere on web.** `POST /classrooms` exists (admin-gated) but **no screen calls it**; the setup wizard creates classes/sections/subjects, NOT classrooms. The Sprint 2 "CORE LOOP" **cannot be set up through the product** — classrooms only exist via direct API call or DB seed. (#1 P0)
  - **Paper generator is built but unreachable.** `/teacher/classrooms/[id]/generate` works end-to-end, but nothing links to it; the classroom-detail Papers tab is a static "Coming in Sprint 5" placeholder.
  - **Teacher home `/teacher` is a dead static page** (verified live): hardcoded copy, action-less hero buttons, "Available in Sprint 2+" tiles, `href="#"` link. A teacher has no in-app path to their own classroom.
  - **Five admin pages are "Coming in v2" placeholders:** `/admin/{classes,students,sample-papers,classrooms,settings}`. So **sample-paper upload (an MVP differentiator) and student management have NO UI** — the AI generator's sample-paper guidance pool can never be populated by a user.
  - **Not deployable.** Only 4 additive migrations exist with exactly ONE `CREATE TABLE` (device_tokens); no baseline migration for the 27 core tables → `prisma migrate deploy` FAILS on a fresh DB. No `migration_lock.toml`, no `vercel.json` / `railway.json` / `eas.json`.
  - **Zero automated tests.** The multi-tenant isolation boundary is unproven by any test. (Being addressed now — adversarial isolation/RBAC suite.)
  - **Other:** OCR worker is a no-op stub; no payment gateway; AI "monthly" credits never reset (no cron); forgot-password is a dead link on web; landing `/` is a Sprint-0 dev stub.
- **Correctly deferred (Phase 2/3, not gaps):** doubts, assignments/quizzes, annotations, analytics UI, audit-log UI, announcements UI, data export, student AI assistant.

The sprint checkboxes below mean **"the sprint's code was written,"** NOT "the feature is reachable / usable / deployable." Treat the gaps above as the real backlog.

⚠️ **REPO LANDMINE — stale workspace symlinks after a folder move.** This repo was moved from `S:\Vaasenk` → `S:\SAMP IT\Vaasenk`. npm workspace symlinks in `node_modules/@vaasenk/*` do NOT survive a move — they keep pointing at the OLD absolute path, so EVERY build fails with cryptic errors (`Can't resolve '@vaasenk/ui/tokens/tailwind'`, `Cannot find module '@vaasenk/ai'`). **Fix: run `npm install` at the repo root** to regenerate the symlinks; after that, `turbo run build` passes 7/7. Beware: `turbo` will return a CACHED "green" build that masks this — always reinstall after cloning/moving this repo before trusting a build.

### Sprint 1 progress (complete — 6 of 6 sessions)

- [x] **1.1** Auth backend module (`apps/api/src/modules/auth/`) — login, register, invite/accept, me, logout, forgot-password
- [x] **1.2** Auth frontend pages — `/login` + `/register` with Supabase + role-based redirect
- [x] **1.3** Invite model + Institutions backend + unstubbed `/auth/invite/accept`
- [x] **1.4** Institution setup wizard (frontend) — Playbook Prompt 7
- [x] **1.5** User management backend — Playbook Prompt 8 (invite teacher, create/import student, list, status, soft-delete) + 5 audit follow-ups
- [x] **1.6** User management frontend — Playbook Prompt 9 (teacher list + invite drawer)

### Sprint 2 progress (complete — 5 of 5 sessions)

- [x] **2.1** Classrooms backend module — Playbook Prompt 10 (create, list role-filtered, detail, join via invite code, refresh code, members)
- [x] **2.2** Notes backend module — Playbook Prompt 11 (multipart upload via NotesStorageService, list with tag filter, signed URLs, bookmarks, OCR job stub on BullMQ `notes` queue, NOTE_PUBLISHED fan-out)
- [x] **2.3** Teacher classroom detail page — Playbook Prompt 12 (`/teacher/classrooms/[id]` with Notes tab full, Students + Settings partial, Papers + AI placeholders)
- [x] **2.4** Student home dashboard — Playbook Prompt 13 (`/student` greeting + 3 quick actions + recent notes Promise.allSettled aggregate + classroom horizontal scroll + empty state)
- [x] **2.5** Student classroom feed + note viewer — Playbook Prompt 14 (`/student/classrooms/[id]` feed with filter chips + bookmark + download per card, plus chrome-less `(viewer)` route group for `/student/classrooms/[id]/notes/[noteId]` with image pinch-zoom via `react-zoom-pan-pinch` + PDF iframe + text fallback + bottom action bar)

**Current Sprint:** Last-mile MVP assembly + production-readiness (the work that makes the built code actually usable/deployable — NOT "post-MVP polish"; see the corrected BUILD STATUS above).
**Current Focus (real P0 backlog, priority order):** (1) **Classroom-creation UI** — the core-loop blocker. (2) Wire orphaned/dead surfaces: teacher home → classrooms, Papers tab → the working generator, plus real sample-paper upload + student-management screens. (3) **Make it deployable** — commit a baseline Prisma migration (+`migration_lock.toml`) and add Vercel/Railway/EAS configs. (4) **Tenant-isolation + RBAC test suite** (in progress). (5) Then: payment gateway, AI credit-reset cron, OCR, forgot-password, real landing page, mobile release setup (assets + `.env` + `eas init`).

### Sprint 8 progress (in progress)

- [x] **8.1** Subscriptions backend — Playbook Prompt 29. Schema: additive migration `20260526000000_subscription_limits` adds `TRIAL` to `SubscriptionPlan` enum + `user_limit` / `storage_limit_gb` / `storage_used_gb` columns to `subscriptions`; existing rows backfill to the conservative FREE-tier defaults (5 / 1.0 / 0). New `apps/api/src/modules/subscriptions/` module (Global) with `plan-defaults.ts` (5 plans × {userLimit, storageLimitGb, aiCreditsMonthly}; numbers are first-pass guesses anchored to typical Indian school sizes), `SubscriptionsService` exposing `ensureUserLimitAvailable / ensureAiCreditsAvailable / ensureStorageAvailable / incrementAiCredits / incrementStorageUsed / decrementStorageUsed` + `getForInstitution / updatePlan`, and `InstitutionStatsService` exposing `getStats / getActivity`. Controller at `/institutions/:id/subscription` (GET, PATCH) + `/institutions/:id/stats` (GET) + `/institutions/:id/activity` (GET with `limit` default 10 max 50); all guarded by `@Roles(ADMIN, SUPER_ADMIN)` and service-level `assertCanReach` (cross-tenant 404 non-disclosure). 402 envelope uses the existing `HttpExceptionFilter` flat shape — body `{ code, message, details }` projects to wire `{ error: { code, message, details } }`; codes are `USER_LIMIT_REACHED` / `AI_CREDITS_EXHAUSTED` / `STORAGE_LIMIT_REACHED`. Sprint 4 inline credit check refactored: `ai-chat.service.ts` + `question-papers.service.ts` + `question-papers.worker.ts` now use the formal guard, removing 3 copies of the same SubscriptionStatus-filtered findFirst + in-transaction increment. Question-papers worker also gains a PRE-flight credit guard that flips the job to FAILED with the upgrade-required message instead of consuming a worker slot. Storage tracking wired into 3 upload sites (notes / syllabus / sample-papers) with `ensureStorageAvailable` pre-write + `incrementStorageUsed` post-upload + `decrementStorageUsed` on archive/delete (notes + sample-papers); syllabus replace-file counts the new version's bytes additively (old version stays for restore). User-limit guard wired into 3 user-create sites (`inviteTeacher` / `createStudent` / `importStudentsCsv` — bulk import checks the FULL batch size up-front). New `AuditService` at `apps/api/src/common/audit/audit.service.ts` (Global, best-effort, log-on-fail) plus new audit writes on `note.create`, `user.invite`, `user.create`, `user.import` (note: `classroom.create`, `syllabus.create`, `paper.created`, `paper.published`, `sample_paper.create` already existed from prior sprints — activity feed gets all 9 with human-readable summary lines via `InstitutionStatsService.SUMMARY_MAP`). Storage backfill script at `apps/api/src/scripts/backfill-storage-usage.ts` uses Prisma `aggregate({ _sum })` for indexed sums per institution; manually run, idempotent. Verification: `npx prisma generate` clean, `npm run typecheck --workspace=@vaasenk/api` clean, `npm run lint --workspace=@vaasenk/api` clean, `npm run build --workspace=@vaasenk/api` clean, `npx turbo run lint typecheck build` reports 21/21 tasks green.
- [x] **8.2** Admin dashboard + billing frontend — Playbook Prompt 28. **(a) Role-aware sidebar** — `apps/web/src/app/(dashboard)/layout.tsx` now resolves the actor's role server-side from Supabase `app_metadata.role` (same source the auth middleware reads) and swaps the nav between the full 9-link admin set (Dashboard / Classes / Teachers / Students / Syllabus / Sample Papers / Classrooms / Billing / Settings) and the legacy "role spaces" fallback for everyone else. Icons are passed as STRING KEYS (not function references) into the client-side `<DashboardSidebarNav>` because Next 15 can't serialize component identifiers across the server→client boundary (build broke with "Functions cannot be passed directly to Client Components" until the keys were extracted). Active-state highlighting uses `usePathname()` with strict equality for index routes + prefix-match for sectional routes. Teacher / student layouts unchanged. **(b) Dashboard `/admin/dashboard`** — `page.tsx` is a thin Server Component; `dashboard-client.tsx` does all the work. Identity bootstrap via `/api/v1/auth/me` (matches setup-wizard pattern). Data fetch is `Promise.allSettled` across 7 calls (stats + subscription + activity + syllabus PROCESSING + syllabus FAILED + sample-papers PROCESSING + sample-papers FAILED) so a single endpoint failure doesn't blank the dashboard. Admin Royal gradient hero with first-name greeting + plan badge (gold accent for paid tiers, white-glass for FREE/TRIAL) + renewal date when set. Setup checklist derives 7 onboarding items from `stats` totals (classes / teachers / students / syllabus / sample-papers / notes / AI papers) with per-row "Set up →" deep-links + Brand Flame progress bar + 100% celebration card. Stats grid renders 7 KPI cards (—-fallback for 0 values). AI Processing section dedupes syllabus + sample-paper jobs by id, sorts FAILED-first, caps at 5, includes per-row Retry button calling the existing `reprocess` endpoints. Recent Activity reads `getInstitutionActivity` (handles the special `{ data: { activities }, meta }` DOUBLE envelope from Sprint 8.1) and renders avatars (initials for human actors, robot icon + Deep AI Glow gradient for `actor: null` system events). Subscription panel: when `subscription === null` shows an "Initialize FREE plan" CTA that PATCHes `{ plan: 'FREE' }`; otherwise renders `<SubscriptionPanel>` (extracted as exported helper so the billing page reuses byte-identical chrome) with status chip ("Active" / "Past due" / "Canceled" / "Expired" / "Expiring in Xd" when ≤14d) + 3 `UsageBar`s color-coded by threshold (amber >80%, red ≥95%, Brand Flame otherwise). All 5 component states (default / loading-skeleton / empty / error-with-retry / disabled) on every section. **(c) Billing `/admin/billing`** — server-component shell + `billing-client.tsx`. Eyebrow+title (no full hero — accent strip is enough). Current-plan card reuses `<SubscriptionPanel>`. Plan picker renders 5 tier cards from `PLAN_ORDER` (FREE / TRIAL / STARTER / GROWTH / INSTITUTION) with "Most popular" Brand Flame ribbon on GROWTH + "Current plan" green ribbon on the active tier; per-card caps (users / storage / AI credits) come from the new `PLAN_LIMITS` frontend mirror. INSTITUTION card renders `Contact sales` mailto link instead of select CTA. Selecting a plan opens a Radix Dialog confirm modal that calls `getPlanDiff(targetPlan, currentUsage)` — when the candidate plan's caps are below current usage, the modal shows a red downgrade warning listing every axis that's over (users / storage / AI credits) and REQUIRES an "I understand the new limits will apply" checkbox before the confirm button enables. Toast confirmation on success. Side panel with `Contact sales` CTA for tailored plans. **(d) `apps/web/src/lib/plans.ts`** — frontend mirror of `apps/api/src/modules/subscriptions/plan-defaults.ts` (5 plans × {userLimit, storageLimitGb, aiCreditsMonthly} + new `PLAN_COPY` table with marketing name / tagline / INR price + `PLAN_ORDER` array + `getPlanDiff` helper + `formatCreditsCap` / `formatInrPrice` utilities). Documented as a maintained mirror with comments on both files pointing at each other; drift CI is a polish backlog item (same pattern as `apps/mobile/theme/tailwind-vaasenk.cjs`). **(e) `apps/web/src/lib/subscriptions-api.ts`** — typed wrappers `getSubscription` / `updateSubscription` / `getInstitutionStats` / `getInstitutionActivity` over the Sprint 8.1 endpoints. Activity wrapper unwraps the double-nested `{ data: { activities }, meta }` envelope via `apiFetchEnvelope` so callers see a flat `{ activities, total }`. **(f) Placeholder pages** — `/admin/classes`, `/admin/students`, `/admin/sample-papers`, `/admin/classrooms`, `/admin/settings` render a shared `<AdminComingSoonPage>` (Admin Royal mini-hero + "Coming in v2" pill + planned-features bullet list + "In the meantime" pointer at the existing tool that already does part of the job: e.g. Classes → setup wizard, Students → invite codes + CSV endpoint, Sample Papers → backend upload endpoint, Classrooms → teacher detail page + syllabus library map dialog, Settings → setup wizard). Sidebar entries for these routes get a tiny `v2` badge. **(g) `/admin` redirect** — replaced the Sprint 0 placeholder dashboard at `/admin` with a `redirect('/admin/dashboard')` so the role root jumps straight to the real dashboard. **(h) 402 awareness retrofit (bonus delivered)** — `apps/web/src/app/(dashboard)/admin/teachers/invite-teacher-drawer.tsx` and `apps/web/src/app/(dashboard)/admin/syllabus/upload-syllabus-drawer.tsx` now detect `err.status === 402 && err.code === 'USER_LIMIT_REACHED'` (resp. `STORAGE_LIMIT_REACHED`) and surface a dedicated gold-bordered upgrade prompt with a Brand-Flame "Upgrade plan" Link to `/admin/billing` INSTEAD of the generic red error string. Drawer closes on link click for a clean nav. Surgical inserts only — no other behavioral changes to the existing drawers. Verification: `npm run typecheck --workspace=@vaasenk/web` clean, `npm run lint --workspace=@vaasenk/web` clean, `npm run build --workspace=@vaasenk/web` clean (19 routes built incl. all 9 new admin paths), `npx turbo run lint typecheck build` reports 21/21 tasks green.

### Sprint 8.2 deviations from the spec

- **Sidebar nav icons are passed as STRING KEYS, not component references.** Next 15 fails to prerender static pages when a server-component layout passes Lucide `LucideIcon` function references to a client component (`<DashboardSidebarNav>` with `'use client'`). The error reads "Functions cannot be passed directly to Client Components" because component identities don't survive the server→client serialization boundary in the App Router. Fix: layout passes `iconKey: 'dashboard' | 'users' | ...` as primitive strings; the client component maps the key back to a Lucide component via an `ICONS` lookup table. Same pattern works for the fallback "Coming soon" list.
- **`/admin/dashboard` is the canonical dashboard; `/admin` now redirects.** Spec said "build `/admin/dashboard`" but left `/admin` ambiguous. The existing `/admin/page.tsx` was a Sprint 0 placeholder. Replaced it with `redirect('/admin/dashboard')` so the role root resolves to the new dashboard cleanly; the alternative (leaving `/admin` as a duplicate dashboard) would have meant two surfaces drifting out of sync.
- **`<SubscriptionPanel>` is exported from `dashboard-client.tsx` and reused by `billing-client.tsx`.** The spec called for the same panel on both surfaces. Lifting it into a separate shared file would have given a third import target with no real benefit; both surfaces are client components and the dashboard's panel ALREADY needs all the styling, so `export function SubscriptionPanel(...)` from the dashboard client + `import { SubscriptionPanel } from '../dashboard/dashboard-client'` from the billing client keeps things DRY without introducing an extra package boundary.
- **PLAN_LIMITS mirror, NOT a shared package.** Spec said put it at `apps/web/src/lib/plans.ts`. Considered moving the table to `packages/shared-types` so the backend, web, and mobile could all read from one source — declined because (a) `@prisma/client` is the backend's source of truth via enum coupling and shared-types currently has no Prisma awareness, (b) mobile doesn't yet consume plan limits anywhere, and (c) the drift surface is exactly 3 numbers × 5 plans = 15 values. A drift CI check (parse both files at lint time) is a one-file follow-up.
- **`InstitutionStats` and `ActivityRow` types live in the API client mirror, not in `@vaasenk/shared-types`.** Same rationale as the Sprint 1.6 / Sprint 2.5 frontend type mirrors: NestJS DTOs use class-validator decorators that don't survive a pure type-only import; mirroring as a TS type next to the consumer is cheaper than wiring up a separate package boundary.
- **No "billing history" section** — Sprint 8.1 doesn't expose past-subscription rows (the schema has them but no list endpoint exists). The spec marked the section optional gated on data existing; skipped cleanly. Future endpoint + UI is a polish task.
- **Placeholder pages all share `<AdminComingSoonPage>`** — one component, five thin pages, each with eyebrow + title + description + bulleted "planned features" + "In the meantime" pointer at the closest existing alternative. Saves five copies of the same Admin-Royal hero markup. The shared component lives under `apps/web/src/app/(dashboard)/admin/_coming-soon/` (leading-underscore folder so Next App Router doesn't treat it as a route segment).
- **Confirm-downgrade modal blocks on a checkbox, not a typed-confirmation field.** Spec said "I understand limits will apply" checkbox; that's exactly what we built. Resisted adding a typed plan-name confirmation (à la GitHub repo deletion) because the wire surface is small, the action is reversible (just PATCH back to the old plan), and observed-usage counters never reset on plan change — so the worst case is "you accidentally pinched yourself for a minute". The checkbox is enough.
- **Toast is a fixed-positioned div, not Radix Toast or sonner.** No existing toast primitive in the web app; the dashboard's "successfully switched to plan X" feedback is rare enough that a 4s auto-dismiss inline toast suffices. If the app grows more toast surfaces, lift it into `@/components/ui/toast.tsx` then.

### Sprint 8.1 deviations from the spec

- **402 envelope is a flat `{ code, message, details }`**, not a nested `{ error: { code, message } }`. The existing `HttpExceptionFilter` (apps/api/src/common/filters/http-exception.filter.ts) expects flat keys — it reads `r['code']`, `r['message']`, `r['details']` directly off the exception body and re-projects them under the `{ error: ... }` envelope on the wire. The Sprint 4 inline 402 throws (`AI_CREDIT_LIMIT_REACHED`) had a latent bug — they nested `{ error: { code, message } }` so neither key surfaced through the filter — but no caller ever depended on the code so it stayed silent. Sprint 8.1 fixes the shape across all 402s (ai-chat + question-papers + new subscription service). New canonical codes: `USER_LIMIT_REACHED` / `AI_CREDITS_EXHAUSTED` / `STORAGE_LIMIT_REACHED`.
- **Subscription model auto-bootstraps on first PATCH.** The spec assumed an active subscription always exists. In practice fresh institutions don't have a `Subscription` row until billing kicks in. `updatePlan` therefore creates one with sensible FREE defaults if absent — this lets the admin dashboard's "Upgrade plan" CTA work on day 1 without a separate "initialize subscription" endpoint.
- **AuditService is global but doesn't backfill old flows.** Per the spec, we added writes only to user-visible flows where one was missing (`note.create`, `user.invite`, `user.create`, `user.import`). The other 5 visible flows (`classroom.create`, `syllabus.create`, `paper.created`, `paper.published`, `sample_paper.create`) already wrote audit rows directly via `prisma.auditLog.create`. They weren't migrated to the new helper because (a) they work, and (b) the activity feed reads them just as well. Future sprints can DRY them up as a polish task.
- **Storage tracking is approximate.** Counted on raw upload bytes only: thumbnails, re-compressed JPEGs, server-side derivatives are NOT included in the per-institution storage usage. Documented in `SubscriptionsService.ensureStorageAvailable` JSDoc; the user-facing error message says "raw uploads". A future tighter accounting pass can wire in the post-compression buffer length (notes already use `bodyBuffer.length` which is the recompressed size).
- **Plan defaults overwrite caps on plan change; observed counters never reset.** `userLimit` / `storageLimitGb` / `aiCreditsMonthly` are set from the `PLAN_LIMITS` table whenever PATCH changes the plan. `currentUsers` / `storageUsedGb` / `aiCreditsUsed` are observed truth and NEVER reset on plan change — so a tenant downgrading mid-month doesn't lose track of what they've used. Monthly credit reset is a future ops task (cron or scheduled function); we surface usage as-is.
- **Bulk-import user-limit check is up-front, not per-row.** `importStudentsCsv` calls `ensureUserLimitAvailable(institutionId, records.length)` BEFORE the row loop. If the import would push past the cap, the whole batch is refused with a clear 402 — partial seat-grabbing isn't allowed. The CSV admin trims and re-uploads. Simpler UX than racing each row against a moving counter.
- **InstitutionStatsService lives in `subscriptions/` not `institutions/`.** Spec said "your choice" between the two. Subscriptions module owns the same multi-tenant guard surface (`assertCanReach`) and is the only consumer of the dashboard data, so cohesion wins. The controller still mounts under `/institutions/:id/*` so URL conventions are unchanged.
- **Storage backfill script is hand-run, not migration-baked.** Pure SQL aggregation across notes + syllabus + sample-papers is fine for small tenants, but a 100k+ note table multiplied by 100 institutions becomes a 10s-of-seconds operation. Keeping it out of the migration means ops can run it with `screen`/monitoring and re-run it idempotently after big cleanups. Documented in the script's header.

### Sprint 7 progress (complete — 4 of 4 sessions)

- [x] **7.1** Mobile bootstrap — Playbook Prompt 24. `apps/mobile/` scaffolded as `@vaasenk/mobile` workspace (Expo SDK 52, RN 0.76.5, React 18.3.1, TypeScript strict). Monorepo wiring: `metro.config.js` with `watchFolders=[workspaceRoot]` + `nodeModulesPaths=[app,root]` + `disableHierarchicalLookup`. NativeWind v4 + Tailwind v3 (NW v4 doesn't target Tailwind v4 Oxide yet — explicit isolated divergence from web's Tailwind v4) with `babel-preset-expo` + `nativewind/babel` + Reanimated plugin last. Token bridge: `apps/mobile/theme/tailwind-vaasenk.cjs` mirrors `vaasenkNative` colors as CJS (TS can't be `require`d into `tailwind.config.js` without a TS loader). Source of truth stays `design-docs/vaasenk.tokens.json`; the bridge is a maintained mirror. Supabase client (`services/supabase.ts`) uses `expo-secure-store` adapter (NOT AsyncStorage — Keychain on iOS, EncryptedSharedPreferences on Android); falls back to in-memory map on `Platform.OS === 'web'` for `expo start --web`. API client (`services/api.ts`) ports `apps/web/src/lib/api-client.ts` 1:1 — same `ApiClientError`, same `{data,meta}` / `{error.code,message}` envelope, base URL from `EXPO_PUBLIC_API_URL`. Auth flow: `auth.ts:login()` POSTs `/auth/login`, then `supabase.auth.setSession()` hydrates SecureStore (matches `vaasenk-auth-architecture` memory). Navigation: React Navigation v6 with three swappable stacks (`AuthStack`, `StudentTabs`, `TeacherTabs`) driven by `RootNavigator` reading `AuthContext.status + user.role`. Five student tabs (Home/Classrooms/Bookmarks/Downloads/Profile) + five teacher tabs (Home/Classrooms/Upload [center FAB with Brand Flame gradient + glow shadow]/AI/Profile). ADMIN/SUPER_ADMIN bounce to a polite "use the web dashboard" screen. All tab content is `PlaceholderScreen` (role-themed gradient + "Coming in Sprint 7.X" card) except Profile which exposes a real Sign out for QA. Splash + Welcome + Login screens fully wired (Login implements all 5 component states: default / loading / error inline / disabled / N/A-empty). Inter loaded via `@expo-google-fonts/inter` (400/500/600/700/800); native splash held until fonts ready. NavigationContainer themed with Vaasenk Warm Canvas background. Verification: `npm run typecheck --workspace=@vaasenk/mobile` clean, `npm run lint --workspace=@vaasenk/mobile` clean, `npx turbo run lint typecheck` reports 18/18 tasks green.
- [x] **7.2** Student mobile screens — Playbook Prompt 25. Service layer in `apps/mobile/src/services/`: `classrooms.ts` (listMyClassrooms/getClassroom/joinClassroom/getClassroomMembers + module-scope in-memory cache + `invalidateClassroomsCache()` on join), `notes.ts` (listClassroomNotes/getNote/toggleBookmark/setBookmark/listBookmarkedNotes — note backend returns `bookmarkedByMe` inline so mobile prefers the flag over the web's separate `/bookmarks` lookup), `downloads.ts` (expo-file-system-backed JSON index at `documentDirectory/vaasenk/downloads.json` + per-note files namespaced `{institutionId}/notes/{noteId}/{filename}` to mirror Supabase Storage paths per CLAUDE.md §3 rule 5). Per-tab nested NativeStacks (`navigation/student-stacks.tsx`): HomeStack(HomeRoot, JoinClassroom), ClassroomsStack(ClassroomsList, ClassroomFeed, NoteDetail), BookmarksStack(BookmarksList, NoteDetail), DownloadsStack(DownloadsList, NoteDetail with `offline: true`). NoteDetail mounted in 3 stacks with discriminated `offline?: false | true` param so a stale-link DownloadsList tap reads from the local file without hitting the network. `StudentTabs.tsx` swaps placeholders for these 4 stacks + the real ProfileScreen. Shared components in `apps/mobile/src/components/`: NoteListItem (thumbnail + tags + bookmark/download buttons + Lucide icons via `lucide-react-native`), ClassroomCard (coral gradient, compact + row variants), FilterChipRow (7 chips — All + 6 NoteTag values, active uses `heroSunrise` gradient pill), EmptyState, ErrorState, LoadingShimmer (Reanimated 3 opacity pulse, respects `prefers-reduced-motion`). HomeScreen ports the web's Promise.allSettled fan-out for recent notes + coral hero greeting + 3 quick-action tiles + horizontal classroom scroll. JoinClassroom uses 6 segmented display boxes driven by an off-screen TextInput (paste fills all 6, autoCapitalize=characters); 404 → "didn't match active classroom", 410 → "expired" surfaced via the dedicated ErrorState; success drops the student straight into ClassroomFeed. ClassroomFeedScreen is a FlatList with sticky filter chips below the coral hero; bookmark toggle is optimistic with rollback, download progress is inline on the row (refreshes the signed URL before downloading since list-row URLs can be stale by the time the user taps). NoteDetailScreen renders: image → pinch-zoom built on react-native-gesture-handler v2 Gesture.Pinch + Gesture.Pan + Gesture.Tap(2)/Reanimated 3 (1×–4× clamp, double-tap toggles 1↔2×) — explicitly NOT `react-native-image-zoom-viewer` because it still uses the legacy gesture-handler v1 API; pdf → `react-native-pdf` lazy-required so Expo Go's missing-native-module crash is caught and falls back to a FallbackSurface; otherwise → FallbackSurface with `expo-sharing` "Open externally". Bottom action bar: Save (bookmark toggle), Share (`expo-sharing.shareAsync` for local files, falls back to RN `Share` for signed URLs), Download (primary gradient CTA with inline percent). BookmarksScreen lists `/bookmarks` paginated; unbookmark is optimistic + the row disappears immediately. DownloadsScreen reads the local index (zero network), formats bytes, long-press → confirm-delete via `Alert.alert`. ProfileScreen: 88px initials avatar + coral hero + institution chip + stub settings rows (Notifications/Theme/Privacy disabled until later sprints) + real Sign out + app version from `expo-constants`. Deps added: `expo-file-system@~18.0.12`, `expo-sharing@~13.0.1`, `expo-image@~2.0.7`, `react-native-pdf@^7.0.4`, `react-native-blob-util@^0.24.9` (pdf's required peer). Verification: `npm run typecheck --workspace=@vaasenk/mobile` clean, `npm run lint --workspace=@vaasenk/mobile` clean, `npx turbo run lint typecheck` reports 18/18 tasks green.
- [x] **7.3** Teacher mobile screens — Playbook Prompt 26. Service-layer additions (additive — existing 7.2 signatures untouched): `notes.ts` gains `uploadNote()` (multipart XHR with `xhr.upload.onprogress` + AbortController-style xhrRef, RN `FormData` `{uri,name,type}` shape) + concrete `deleteNoteForTeacher()` against `DELETE /notes/:id`; `classrooms.ts` gains `createClassroom()` (gap-documented — backend gates this `@Roles(ADMIN,SUPER_ADMIN)`), `refreshInviteCode()`, and `listTeacherClassrooms` (alias of `listMyClassrooms` — backend's `GET /classrooms` is role-filtered server-side, no `/teacher/classrooms` endpoint exists). New `services/ai-chat.ts` ports the web's `streamAiChat` to RN — XHR-based SSE because RN's `fetch` doesn't expose `response.body.getReader()`; parser slices `xhr.responseText` on each `onprogress` tick. New `services/papers.ts` with `generatePaper/getPaperJob/exportPaper/publishPaper` + `PAPER_PRESETS` (3 sensible defaults so the mobile wizard collapses from 6 steps → 1 form). Per-tab nested stacks in `navigation/teacher-stacks.tsx`: HomeStack(HomeRoot), ClassroomsStack(ClassroomsList, ClassroomDetail, NoteDetail, GeneratePaper, PaperPreview), UploadStack(QuickUpload), AIStack(AISessions, AIChat). TeacherTabs swaps placeholders for these stacks. Teacher-specific components in `components/teacher/`: `TeacherClassroomCard` (Teacher Orange goldCard gradient + invite-code badge), `TeacherStatusChipRow` (DRAFT/PUBLISHED/ARCHIVED filter — separate from student's tag filter), `ConfidenceBadge` (3-tier from `paper.aiConfidence`), `PublishProgressCard` (Brand Flame for upload progress; Deep AI Glow inline-hex for paper generation — token gap documented). Screens — every one ships all 5 component states + tokens-only styling: TeacherHomeScreen (gold hero, 3 quick actions with smart fallback when 1-classroom skips picker; doubts strip is a 0-badge placeholder pending backend), QuickUploadScreen (4-stage state machine — Camera → Preview → Metadata → Publish; ≤4 taps to publish; `expo-camera` `CameraView` + permission inline + flash + flip + library fallback via `expo-image-picker`; on Continue: `expo-image-manipulator.manipulateAsync` downscales any image > 1920px longest edge OR > 2MB to 1920px JPEG q=0.85; last-used classroom + tags persisted to `expo-secure-store` so repeat uploads are 3-tap; XHR upload streams 0–100% via `PublishProgressCard`; on success the cached image is `FileSystem.deleteAsync`-ed), ClassroomDetailScreen (custom pill tab strip — Notes/Doubts/Papers/AI — to avoid pulling in `@react-navigation/material-top-tabs`; invite-code tap-to-copy via `expo-clipboard.setStringAsync` with copied-confirm flash; refresh-code confirm Alert; notes tab uses `TeacherStatusChipRow` + per-row Archive action with confirm), AISessionsScreen (per-classroom selector first — backend reality, no aggregate sessions endpoint; deep AI glow gradient inline hex; mandatory disclaimer chip per CLAUDE.md §6 #5), AIChatScreen (mirrors web ai-chat-view: deep glow hero + disclaimer + thinking-step ticker 700ms + AbortController stop button + 5 quick-prompt chips + citation chips with gold accent; auto-scroll-near-bottom heuristic + "Jump to latest" pill), GeneratePaperScreen (single-screen form with 3 presets — Quick unit test / Monthly test / Quarterly — to skip configuration; sends `portions: ['Whole syllabus']` when the toggle is on, mirroring the web wizard's payload; polls `getPaperJob` every 2s with 5-milestone PublishProgressCard until COMPLETED → `navigation.replace('PaperPreview', …)`), PaperPreviewScreen (segmented control Paper/Answer key + react-native-pdf with the same Expo-Go-safe lazy-require fallback as student NoteDetail + Export/Publish actions with confirm modal). Deps added: `expo-camera@~16.0.0`, `expo-clipboard@~7.0.0`, `expo-image-manipulator@~13.0.0`, `expo-image-picker@~16.0.0`. `app.json` plugins extended with `expo-camera` (camera permission copy) + `expo-image-picker` (photos permission copy). Verification: `npm run typecheck --workspace=@vaasenk/mobile` clean, `npm run lint --workspace=@vaasenk/mobile` clean, `npx turbo run lint typecheck` reports 18/18 tasks green.
- [x] **7.4** Push notifications — Playbook Prompt 27. **Both sides shipped + orchestrator-verified 21/21 turbo green.** Schema: `DeviceToken` model + `DevicePlatform` enum (IOS/ANDROID/WEB) + inverse relations on `User.devices` and `Institution.deviceTokens`; migration `20260525000000_add_device_tokens` is purely additive (new table + enum + FKs, no existing-table changes). Endpoints under the existing `/api/v1/users` controller — `POST /users/me/devices` (idempotent upsert keyed on globally-unique `expoPushToken`; transfers ownership on user switch on the same physical device; institutionId derived from JWT, never client-trusted per CLAUDE.md §3) + `DELETE /users/me/devices/:deviceId` (404 — not 403 — on cross-user access to avoid leaking foreign-device existence). DTO validates the Expo token shape via `Matches(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/)` so FCM tokens/APNs hex/empty strings can't enter the table; platform input is the lowercase wire string (`ios|android|web`), mapped to the uppercase Prisma enum at the service boundary. `ExpoPushService` (`apps/api/src/modules/notifications/expo-push.service.ts`) chunks messages at 100 per Expo Push API call, sends via native `fetch` (NO `expo-server-sdk` — see deviations), parses per-message ticket receipts, and prunes `device_tokens` rows flagged `DeviceNotRegistered` via `deleteMany`. Other transient codes (`MessageRateExceeded`, `MessageTooBig`) are logged and left in place. `ExpoPushWorker` drains the new `expo-push` BullMQ queue with 3 attempts + 5s exponential backoff; `NotificationsService.notify/notifyMany` enqueue (NOT fire-and-forget — see deviations) after the in-app `Notification` row + Socket.IO emit so the critical path is never blocked by the external Expo API. Android channel routing per the contract: NOTE_PUBLISHED→`notes`, AI_CREDITS_LOW→`ai`, everything else→`system`. The Sprint 6.1 in-app + WebSocket behavior is byte-identical to before — public signatures of `notify/notifyMany` unchanged so all six existing callers (notes.service, question-papers.service, question-papers.worker, classrooms.service, syllabus.worker, ai-chat.service) keep working unchanged. Env: optional `EXPO_ACCESS_TOKEN` added to `EnvConfig` + `.env.example` (only required when Expo "Enhanced security" is enabled on the project). Verification: `npm run typecheck --workspace=@vaasenk/api` clean, `npm run lint --workspace=@vaasenk/api` clean, `npm run build --workspace=@vaasenk/api` clean, `npx turbo run lint typecheck --filter='!@vaasenk/mobile'` reports 16/16 tasks green (mobile-side typecheck error in `apps/mobile/src/services/push-links.ts` is owned by the parallel Mobile App Builder agent, not this scope).
    - **Mobile side complete** (orchestrator flips top checkbox after dual verification). New service layer in `apps/mobile/src/services/` — `push-channels.ts` (3 Android channels notes/ai/system installed before token fetch; idempotent; no-op on iOS/web), `push.ts` (`registerForPushNotifications()` walks the permission ladder, persists hard-deny under `vaasenk-push-permission-denied` so we don't re-prompt, gates on `Device.isDevice` so simulators short-circuit to `{status:'skipped', reason:'simulator'}` instead of crashing the dev client, resolves EAS projectId from `Constants.expoConfig.extra.eas.projectId` with a `Constants.easConfig.projectId` fallback, POSTs `{expoPushToken, platform, deviceName, appVersion, osVersion}` to `/api/v1/users/me/devices`, and persists the returned `device.id` to SecureStore under `vaasenk-device-id`; `unregisterPushNotifications()` is best-effort and runs BEFORE `supabase.auth.signOut()` so the DELETE call still has a valid JWT; also exports `installDefaultForegroundHandler`/`installBackgroundForegroundHandler` for the AppState-driven foreground/background toggle), `push-links.ts` (pure `getDeepLinkForNotification(input, role)` taking EITHER `NotificationView` OR the new `PushNotificationData` shape and returning a discriminated `{stack, screen, params}` descriptor or `null`; routes NOTE_PUBLISHED role-aware → NoteDetail, PAPER_GENERATED → PaperPreview, PAPER_FAILED → ClassroomsList, CLASSROOM_JOINED → ClassroomDetail; SYLLABUS_READY/FAILED + AI_CREDITS_LOW return null because mobile has no admin surface; parses `vaasenk://student|teacher/classrooms/...` URLs from SYSTEM_ANNOUNCEMENT.link with RBAC; cross-role payloads no-op rather than mis-route), `notifications-socket.ts` (1:1 port of the web's Sprint 6.2 `socket.ts` — same namespace, callback-form auth that pulls a fresh Supabase token on each reconnect, same `notification:created` + `notification:unread-count` events), `notifications-api.ts` (port of web `api.ts` — `listNotifications`/`markNotificationRead`/`markAllNotificationsRead`), `notifications-types.ts` (frozen contract mirror + new `PushNotificationData` shape for OS `data` payloads), `use-notifications.ts` (RN port of the web reducer + adds `addNotificationReceivedListener` for foreground OS pushes that prepends to the list with dedupe against socket events, `addNotificationResponseReceivedListener` + `getLastNotificationResponseAsync` for tap-to-deep-link incl. cold-start, AppState listener that flips `setNotificationHandler` between silent-badge foreground and show-banner background to prevent double-buzz, plus a `setBadgeCountAsync(unreadTotal)` effect for iOS app icon + compatible Android launchers), `notifications-context.tsx` (`NotificationsProvider` hosts ONE instance for the entire authenticated subtree so the per-tab bell doesn't open N sockets). Navigation: `apps/mobile/src/navigation/navigation-ref.ts` extracted from `App.tsx` to break a circular import; `RootNavigator` registers push once per authenticated STUDENT/TEACHER session, mounts `NotificationsProvider` over the tabs subtree, and routes tap deep-links via `navigationRef.navigate`. `auth-context.tsx` invokes `unregisterPushNotifications()` before `supabase.auth.signOut()` so the DELETE call still has a valid JWT. UI: `apps/mobile/src/components/notifications/` — `NotificationBell` (44×44 hit target + brand-red badge capped at "9+" + tiny red dot when `connectionState === 'error'` or REST has a cached-but-stale error; all 5 states), `NotificationCenterSheet` (slide-up `<Modal>` with safe-area-aware drag handle + Today/Yesterday/This week/Older grouping + per-type Lucide icon + role-tinted backplate + optimistic row mark-read + tap-to-deep-link routed through `navigationRef` after a 50 ms modal-dismiss setTimeout for animation smoothness + soft "cached" banner when an error coexists with prior data + LoadingRows skeleton + "You're all caught up" EmptyState + ErrorState retry; all 5 states), `BellOverlay` (floating top-right bell pinned to the SafeArea — added because the tab navigators run `headerShown:false` and each screen draws its own role-themed hero, so there's no `headerRight` slot; `pointerEvents='box-none'` lets taps fall through to the screen unless they land on the bell; mounted once in both StudentTabs + TeacherTabs as a sibling to the Tab.Navigator so it persists across all 5 tabs in each role). Deps added: `expo-notifications@~0.29.0` (Expo SDK 52 line), `expo-device@~7.0.0`, `socket.io-client@^4.8.1`. `app.json` plugins extended with `expo-notifications` (default channel `system`, brand-red `color`; no custom `icon` because the existing `./assets/` is a stub — falls back to the app icon). Verification: `npm run typecheck --workspace=@vaasenk/mobile` clean, `npm run lint --workspace=@vaasenk/mobile` clean, `npx turbo run lint typecheck` reports 18/18 tasks green.

### Sprint 7.4 (mobile) deviations from the spec

- **BellOverlay instead of `headerRight`.** The spec asked for the bell in each tab's `headerRight`. The mobile tab navigators run with `headerShown: false` because every screen draws its own role-themed gradient hero (a CLAUDE.md §4 requirement). Turning the header back on would either (a) clash visually with every hero, or (b) require a per-screen header-stripping pass. Instead, `BellOverlay` is a floating absolute-positioned chip pinned to the safe-area top-right inside a wrapping `<View>` in StudentTabs + TeacherTabs. It persists across all five tabs in each role, reads from the shared `NotificationsProvider`, and uses `pointerEvents='box-none'` so it doesn't block underlying interactions.
- **NotificationsProvider in RootNavigator, not a per-bell hook.** The spec listed the bell as the consumer of `useNotifications`. A naive read would create one instance per tab header, opening N Socket.IO connections + N OS push listeners. The provider pattern hosts a single hook instance for the authenticated subtree — the bell on each tab reads from `useNotificationsContext()` for free.
- **`navigation-ref.ts` extracted from App.tsx.** RootNavigator needs the navigation ref to dispatch deep-links; App.tsx is what binds the ref to the NavigationContainer. Originally placed the ref in App.tsx (re-exported); that created a circular import via `App ↔ RootNavigator`. Extracted to `apps/mobile/src/navigation/navigation-ref.ts` so both files import from a leaf module.
- **No `shouldShowBanner`/`shouldShowList` flags on the foreground handler.** Expo SDK 52 still uses the legacy `shouldShowAlert`/`shouldPlaySound`/`shouldSetBadge` triad. SDK 53 split `shouldShowAlert` into `shouldShowBanner` + `shouldShowList`. We use the SDK-52 shape and leave a comment in `push.ts` so the SDK-53 migration is a one-line widen.
- **EAS projectId is unset in `app.json`.** `expoConfig.extra.eas.projectId === ""` in this repo — push tokens won't actually be deliverable until `eas init` runs and populates it. `push.ts` detects this and returns `{status:'skipped', reason:'no-project-id'}` with a dev-only `console.warn` so the registration surface stays cleanly idle. Once EAS Build runs, the projectId is injected automatically and registration starts working without any code change.
- **No notification icon asset.** The repo's `apps/mobile/assets/` is a stub. `expo-notifications` plugin block omits the `icon` field; Android falls back to the app icon. Adding a 96×96 monochrome PNG and re-enabling the icon field is a Sprint 8 polish task.
- **`Device.isDevice`-gated registration.** iOS simulator and Android emulator can't obtain APNs/FCM tokens — `getExpoPushTokenAsync` throws on these. The function short-circuits with `{status:'skipped', reason:'simulator'}` so the dev experience doesn't crash. QA requires a physical device + `eas build --profile development`.
- **Push payload `metadata` is intentionally null on mobile.** Expo's OS push payload caps the `data` object at 4 KB. The push contract only carries `{notificationId, type, entityType, entityId, link}` — no full `metadata` blob. `push-links.ts` handles this gracefully: when `entityType`/`entityId` are insufficient, the router returns null (instead of fabricating routes from missing data). The bell-sheet's REST/Socket path still gets the full `metadata` for richer routing.

### Sprint 7.1 deviations from the Playbook

- **Tailwind v3 (NOT v4) for mobile.** NativeWind v4 still requires Tailwind v3.4 syntax — Tailwind v4's Oxide engine doesn't target React Native yet. This is an explicit divergence from the web app's Tailwind v4 setup. Single isolated config in `apps/mobile/tailwind.config.js`; web remains untouched.
- **Token bridge via CJS mirror.** `apps/mobile/theme/tailwind-vaasenk.cjs` re-states the Vaasenk colors as a CommonJS module so `tailwind.config.js` (which runs in Node, not bundled) can consume them synchronously. The TS source of truth in `@vaasenk/ui/tokens/native-theme.ts` is still authoritative; the CJS file is a maintained mirror with a comment pointing to the source. A token-drift CI check is a small follow-up.
- **`build` script is `exit 0` with a marker echo.** Originally `expo export` per the Sprint 7.1 agent's choice; reverted at Sprint 7 close-out by the orchestrator. Reason: `expo export` ran on each `npx turbo run build` and (a) defaulted to bundling the `web` target, requiring `@expo/metro-runtime`, and (b) once that was scoped to `--platform ios --platform android`, it then tripped on npm-workspace tailwindcss hoisting (`react-native-css-interop` was hoisted to root and resolved root's `tailwindcss@4` instead of mobile-local `tailwindcss@3`, which NativeWind v4 rejects). EAS Build handles real mobile bundling on its own pipeline; `lint` + `typecheck` cover the CI smoke signal. The marker echo documents the intent so future readers don't reintroduce `expo export`.
- **No `react-native-vector-icons`.** Using `lucide-react-native` instead — same icon family as the web app's `lucide-react`, parity across surfaces.
- **No Expo Router.** Playbook explicitly said React Navigation; sticking with that. `App.tsx` uses `registerRootComponent` + plain RN Navigation v6 stacks.
- **`@react-navigation/native-stack` + `@react-navigation/bottom-tabs` at v6, not v7.** v7 changes `sceneStyle` and ParamList typing; web ecosystem is still mostly v6 and the migration cost outweighs v7's perks for 7.1. The v6 `sceneStyle` prop was removed (it landed in v7); per-screen ScrollViews + NavigationContainer theme handle background coloring.
- **`AdminBlocked` screen.** ADMIN and SUPER_ADMIN users on mobile get a polite "use the web dashboard" gradient card with a sign-out CTA. Mobile is student/teacher first; building admin tabs would violate "do not work on a future sprint's features".

### Sprint 7.2 deviations from the Playbook

- **PDF viewer needs a dev build.** `react-native-pdf` is a native module — Expo Go can't host it. `NoteDetailScreen` lazy-requires it inside a try/catch so the bundle still parses; if the module isn't available at runtime, PDFs fall through to the FallbackSurface with an "Open externally" CTA (via `expo-sharing`). For full QA the team needs to run `eas build --profile development` or `npx expo run:ios|android`. No config plugin is required (the package autolinks).
- **Image pinch-zoom is built in-house** with `react-native-gesture-handler` v2 Gesture composables + Reanimated 3, NOT `react-native-image-zoom-viewer` from the spec. The viewer-library still depends on RNGH v1 bindings — adding it would conflict with the v2 setup 7.1 plumbed. The custom path is ~120 lines, clamps to 1×–4×, supports double-tap toggle, and is reactive-only (no JS thread hops during the gesture).
- **`bookmarkedByMe` flag is consumed directly.** The backend already stamps each note view with `bookmarkedByMe` (notes.service.ts → toView). The web equivalent runs a separate `/bookmarks?limit=100` to derive the same set — mobile saves the round-trip by reading the inline flag. Acceptable because the network cost matters more on mobile.
- **`POST /notes/:id/bookmark` is the toggle.** Backend has no dedicated DELETE; `setBookmark(noteId, desired)` calls the toggle endpoint and retries once if the result doesn't match the intent. Idempotent in practice because the backend returns the new state in the body.
- **In-memory cache, not a query library.** Tab switches between Home and Classrooms paint instantly via a module-scope `Map`-like cache in `services/classrooms.ts`. `@tanstack/react-query` would add ~30 kB for the same UX; deferred until we hit a real correctness issue.
- **Download path mirrors backend storage layout.** `${documentDirectory}vaasenk/${institutionId}/notes/${noteId}/${filename}` — same prefix scheme as Supabase Storage so debug logs across both surfaces look identical. The institutionId is read from the NoteView (which the backend stamped from the JWT), NEVER from any client-side guess (CLAUDE.md §3 rule 4).
- **No `/classrooms/preview?code=` pre-flight.** Spec asked for a code preview before join; backend doesn't expose one. Mobile validates client-side (6-char A-Z0-9) and lets the join request itself surface 404/410. Net effect for the student is identical (and one fewer round-trip).

### Sprint 7.3 deviations from the Playbook

- **No "Create classroom" UI on mobile.** Backend's `POST /classrooms` is `@Roles(ADMIN, SUPER_ADMIN)` only — teachers cannot create classrooms via the API. Documented as a gap in `services/classrooms.ts`; `createClassroom()` is exported for future use if the role gate relaxes. The teacher classrooms list shows a polite "Once an administrator assigns you a class" empty state instead of a Create button. The TeacherCreateClassroom screen in the Playbook spec is intentionally not built.
- **AI SSE streaming uses XHR, not fetch.** Web's `ai-chat-stream.ts` uses `fetch` + `response.body.getReader()` (ReadableStream). React Native's fetch does NOT expose a ReadableStream on the response body in 2026 (RN 0.76 supports `EventSource` natively but not ReadableStream on responses). `services/ai-chat.ts` uses `XMLHttpRequest` with `responseType: 'text'` + `onprogress` slicing — `xhr.responseText` accumulates and we parse newly-arrived bytes each tick. Same frame-boundary parser as the web (`nextFrameBoundary` handles `\r\n\r\n` and `\n\n`). Zero extra dependencies; documented in `services/ai-chat.ts`.
- **Mobile paper wizard collapses 6 steps → 1 form + 3 presets.** Web has portions → config → guidance → generate → preview → export. Mobile's GeneratePaperScreen surfaces 3 PAPER_PRESETS (Quick unit test 50/60min, Monthly test 100/120min, Quarterly exam 100/180min) the teacher picks first; portions defaults to "Whole syllabus" toggle (sends `['Whole syllabus']` payload matching the web's wizard); marks/duration are inline inputs; difficulty mix + sample paper picker are intentionally excluded (mobile fingers, small screen). Teachers wanting fine-grained control are pointed to the web wizard. PreviewScreen omits the structured-JSON editor for the same reason.
- **PaperPreview reads paper data from the job, not a `GET /question-papers/:id` endpoint.** Backend exposes only `GET /question-papers/jobs/:id` (with `paper` embedded). No standalone paper detail endpoint and no per-classroom paper list endpoint exist. The teacher Papers tab therefore surfaces a placeholder card + "Generate paper" CTA only — recent papers list is gap-documented. Sprint 7.4 / Sprint 8 candidate: `GET /classrooms/:id/question-papers` list endpoint + `GET /question-papers/:id` detail endpoint.
- **No `@react-navigation/material-top-tabs`.** ClassroomDetail's Notes/Doubts/Papers/AI strip is a custom pill bar (mirrors `FilterChipRow`'s active-pill aesthetic). Saves ~40kB and keeps the keyboard-shouldPersistTaps story simple.
- **`Deep AI Glow` gradient is inlined as hex stops** in AISessionsScreen, AIChatScreen, and PublishProgressCard with a TODO pointing to `packages/ui/tokens/native-theme.ts`. The token table currently exposes `redGlow`/`goldCard`/`studentCandy`/`heroSunrise` but not the 4-stop Deep AI Glow from CLAUDE.md §4. A polish-sprint task is to add `deepAIGlow` to the native theme; the inline hex stops keep the visual exact in the meantime.
- **PDF font for PaperPreview is whatever react-native-pdf renders** (no font registration needed — it reads embedded fonts from the PDF). Server-side font choice (Helvetica per Sprint 5.2 deviations) carries through.
- **Mobile upload uses XHR for progress**, mirroring the rationale documented in `apps/web/src/lib/xhr-upload.ts` — RN's `fetch` doesn't expose upload progress, and the teacher must see a real % counter during publish (the headline ≤60s flow needs visual feedback). The XHR multipart path also lets the upload survive screen unmount via an `xhrRef.current?.abort()` cleanup.
- **Teacher NoteDetail is a separate screen**, not a shared variant of the student's. The student viewer is rich (pinch-zoom on images, offline mode, bookmark UI). The teacher only needs to verify-what-students-see + archive; making the student screen polymorphic across navigator types added more boilerplate than the duplication saves. `TeacherNoteDetailScreen` lives in `screens/teacher/NoteDetailScreen.tsx`.

### Sprint 7.4 deviations from the contract (BACKEND side only — mobile in progress)

- **No `expo-server-sdk` dependency.** Native `fetch` (Node 20+) is used directly against `https://exp.host/--/api/v2/push/send`. The SDK would add ~60kb plus a transitive dep tree purely to wrap a single REST endpoint. The wire shape (POST JSON array + parse `data[i]` receipts + watch `details.error === 'DeviceNotRegistered'`) is small enough to hand-roll inside `ExpoPushService`. If/when we need getReceiptIds polling or sandboxed receipts, swap in the SDK then. Documented at the top of `expo-push.service.ts`.
- **BullMQ queue route, NOT fire-and-forget.** The contract allowed either. We picked the queue because (a) it gives us 3 retries with exponential backoff for transient Expo failures, (b) failed jobs show up in the same dashboard as the OCR + syllabus + question-papers pipelines, and (c) a future global concurrency cap is a one-liner on the worker. The fan-out happens AFTER the in-app `Notification` row + Socket.IO emit, so the request path is never blocked. `notify()`/`notifyMany()` `void`-call the enqueue helper with a `.catch` so a queue outage logs and moves on.
- **Push enqueue uses recipient unreadTotal as the badge.** Each `ExpoPushMessage.badge` is the recipient's authoritative unread total computed inside `notifyMany` (one `count()` per user — same N round-trips Sprint 6.1 already does for `emitUnreadCount`). No deltas; the badge always reflects truth, matching the Socket.IO `notification:unread-count` contract.
- **Both `notify` (single) and `notifyMany` (bulk) call the same enqueue helper.** Sprint 6.1's path differences (single = direct create + WS emit; bulk = createMany + batch-recovery via _batchId metadata) are preserved verbatim. The new push fan-out runs on the typed NotificationView projections after both paths have settled.
- **Token uniqueness is enforced at the schema level via `@unique` on `expoPushToken`.** Upsert keyed on that column handles the "user switch on the same physical device" case in a single round-trip — no race against a separate findFirst + create. `userId`/`institutionId` are re-bound to the current actor on every register call so an old user's token can never receive notifications for the new user.
- **`DELETE /users/me/devices/:deviceId` returns 200 with `{ data: { deleted: true } }` on success.** Matches the contract verbatim. The Sprint 6.1 `ResponseInterceptor` envelope detection passes `{ deleted: true }` through wrapped (single-key object that's NOT `data` → gets wrapped).
- **Device endpoints sit on the existing `UsersController` at `/api/v1/users`.** A separate "me" controller would have duplicated the JwtAuthGuard plumbing and split a tiny number of endpoints across two files. Keeping them on the existing controller (declared first so the `me/` literal segment matches before any future `:id`-prefixed route) is the lighter touch.
- **Validation: Expo token shape is a `Matches` regex, NOT a deep validation.** `^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$` catches obvious junk (FCM tokens, APNs hex, empty strings). Expo's API will reject malformed tokens with `DeviceNotRegistered` at send time; the regex is the cheap gate at the table.
- **Channel routing map covers every NotificationType including legacy values.** `NOTIFICATION_CHANNEL_BY_TYPE` is exhaustive over the enum so the TypeScript type check is exhaustive and any stray legacy `notify` call routes to `"system"` instead of crashing.
- **Migration is hand-written SQL, NOT `prisma migrate dev`.** Per the original CLAUDE.md note on Sprint migrations — when the working DB has real data or is unreachable, the SQL file is authoritative. The schema.prisma is updated in lockstep; `npx prisma generate` regenerates the client successfully, and the migration shadow-builds cleanly when run against a fresh local DB.

### Sprint 7.3 open risks for 7.4

- **Backend gap: `GET /classrooms/:id/question-papers` + `GET /question-papers/:id`.** Required to surface a real paper list in the teacher Papers tab and to deep-link from a push notification into a paper. Sprint 8 candidate.
- **Backend gap: doubts.** No backend at all yet. ClassroomDetail Doubts tab and TeacherHome doubts strip render placeholders with `0` count. Backend module + endpoints are a separate sprint.
- **Deep AI Glow native token missing.** Three screens use inline hex stops. Adding `deepAIGlow` to `packages/ui/tokens/native-theme.ts` + the Tailwind theme bridge is a one-file follow-up.
- **`expo-camera` + `react-native-pdf` need a development build.** QuickUploadScreen + PaperPreviewScreen + (student) NoteDetail PDF all require the dev client (`eas build --profile development` or `npx expo run:ios|android`). Expo Go won't run camera capture or PDF rendering. Document in the dev README when one is written. The PDF surfaces have a friendly "Open externally" fallback via `expo-sharing`.
- **Sprint 7.4 push notification deep links** will hit ClassroomDetail (initialTab=papers / ai), AIChat (classroomId+sessionId), and NoteDetail (noteId+classroomId). All three routes already accept the params the backend will send — `expo-notifications`'s `data` payload maps to `navigation.navigate(stack, {screen, params})` with no service-layer changes needed. The teacher service layer is push-ready.

### Sprint 7.1 open risks for 7.2 / 7.3 / 7.4

- **Asset placeholders.** `app.json` references `./assets/icon.png`, `splash.png`, `adaptive-icon.png`, `favicon.png` — these PNGs are NOT committed. `expo start` works without them but `eas build` will fail. Drop brand assets in `apps/mobile/assets/` before the first build (notes in `assets/README.md`).
- **`@types/react-native` was dropped** during install — npm warned it's deprecated (RN ships its own types now). The `.d.ts` reference in `expo-env.d.ts` + `nativewind-env.d.ts` is sufficient. If any 7.2/7.3 code imports `import type {...} from 'react-native'` and TS gripes, reinstall is one-liner.
- **No background WebSocket plumbing yet.** Sprint 6's notifications gateway exists on the backend; the mobile client doesn't subscribe yet. 7.4 will own the `expo-notifications` registration + device-token endpoint; the in-app socket listener mirroring `apps/web/src/lib/notifications/socket.ts` is a small 7.4 add. No work needed in 7.1 / 7.2 / 7.3 to unblock it.
- **`forgot-password` flow is documented but not wired.** The "Forgot password?" label on LoginScreen is a no-op; backend already exposes `POST /auth/forgot-password`. A dedicated reset screen + deep-link handler from the email is a small later-sprint add.
- **`EXPO_PUBLIC_API_URL=http://localhost:4000` won't reach the dev API from a physical device.** Document in `.env.example` already (LAN IP needed). Worth a note in the dev README when one is written.
- **NativeWind className strings are wired but unused in Sprint 7.1.** All screens use `style={{...vaasenkNative.*}}` directly because the role-themed gradient hero + glass cards rely on token values, shadows, and gradient stops that don't map cleanly to Tailwind utilities. NativeWind is ready for 7.2/7.3 atomic layout (`flex-1 px-5`) — it's plumbed through Metro and Babel, the class names just don't appear in the placeholder code. Verify on first real screen.

### Sprint 6 progress (complete — 2 of 2 sessions)

- [x] **6.1** Notifications backend module — Playbook Prompt 22. `apps/api/src/modules/notifications/` with REST (`GET /notifications?read&type&page&limit`, `PATCH /:id/read`, `PATCH /read-all`) + `@Global()` `NotificationsService.notify/notifyMany/maybeNotifyCreditsLow` helpers + Socket.IO gateway over namespace `/notifications` with JWT-handshake auth (token via `auth.token` / `?token=` / `Authorization: Bearer`) that auto-joins `user:{id}` + `institution:{id}` rooms and emits `notification:created` + `notification:unread-count`. `main.ts` registers `IoAdapter` explicitly. `NotificationType` enum extended with `PAPER_GENERATED`, `PAPER_FAILED`, `SYLLABUS_READY`, `SYLLABUS_FAILED`, `CLASSROOM_JOINED`, `AI_CREDITS_LOW`, `SYSTEM_ANNOUNCEMENT` (additive `ALTER TYPE … ADD VALUE IF NOT EXISTS` migration — Postgres can't drop enum values). Six trigger sites wired: notes.service (NOTE_PUBLISHED via helper), question-papers.service (PAPER_GENERATED, renamed from PAPER_READY), question-papers.worker (PAPER_FAILED in markFailed + maybeNotifyCreditsLow on success), classrooms.service (CLASSROOM_JOINED on first ACTIVE join), syllabus.worker (SYLLABUS_READY/FAILED fan-out to admins), ai-chat.service (maybeNotifyCreditsLow post-completion).
- [x] **6.2** Notification center frontend — Playbook Prompt 23. `apps/web/src/lib/notifications/{types,api,socket,links,use-notifications}.ts` + `apps/web/src/components/notifications/{notification-bell,notification-center}.tsx`. Bell replaces the placeholder `<button>` in `(dashboard)/layout.tsx`. Radix `DropdownMenu` panel grouped Today/Yesterday/This week/Older (empty groups omitted). Optimistic mark-read → router.push to deep-link resolved via `getNotificationHref()` (prefers `notification.link`, otherwise routes by `type` + `entityType` + `entityId`). Brand-flame gradient badge with `9+` cap, pulse animation gated by `prefers-reduced-motion`. Socket reconnect uses `auth: (cb) => cb({ token: await getToken() })` so Supabase JWT rotation is handled. All 5 component states on both bell + center. `socket.io-client@^4.8.1` added to `apps/web/package.json`.

### Sprint 6 deviations from the Playbook

- **`notification:created` payload shape** is `{ notification: NotificationView }`, not bare `NotificationView`. Same for `PATCH /:id/read` (returns `{ notification }`) and `PATCH /read-all` (returns `{ markedReadCount: number }`). The Frontend agent matched actual backend code, not the spec sketch.
- **Mobile dropdown, not Radix Sheet.** Spec allowed either; chose responsive dropdown clamped to `w-[min(360px,calc(100vw-1.5rem))]` to avoid pulling in `@radix-ui/react-dialog` chrome just for a notification list. Swap-in is straightforward if user testing demands a sheet.
- **No `/notifications` standalone page** — out of scope for Sprint 6.2. Footer "View all" link backlogged.

### Sprint 6 close-out fixes

- **`--vaasenk-line-sand` token added** (`#EAD7CF` per CLAUDE.md §4) to `packages/ui/tokens/theme.css` AND `packages/ui/tokens/tailwind.theme.css`. The token was referenced 239 times across 37 files but undefined — browsers silently fell back to `currentColor` so borders were rendering as text color. Now resolves correctly.
- **Reconnect storm during sign-out** noted as a known small annoyance (1-10s of retries between sign-out and route change). Acceptable for Sprint 6; can be hardened later by listening to Supabase `onAuthStateChange` and explicitly disconnecting.

### Sprint 5 progress (complete — 3 of 3 sessions)

- [x] **5.1** Question-papers backend module + BullMQ worker — POST /generate, GET /jobs/:id, PATCH, /regenerate-question, /export, /publish. Worker reuses `ChatService.complete()` + portion-filtered chunk retrieval. JSON output validated against requested marks/types via `paper-validation.ts` (sum-of-marks exact match + question-type count ±1 tolerance + answer-key completeness). AI confidence score computed from pass-validation + marks total + type counts + source-grounding.
- [x] **5.2** PDF export service — `@react-pdf/renderer`-based templates (`paper-template.ts` + `answer-key-template.ts`), server-side via `React.createElement` helper (no JSX in .ts; commonjs tsconfig stayed unchanged), Helvetica font (Inter via `Font.register` deferred to Sprint 5.4), A4 page, clean black-ink exam-paper styling. `PapersStorageService` mirrors NotesStorageService at `${institutionId}/papers/${paperId}/paper.pdf` + answer-key.pdf. Paths stored; signed URLs (1h) generated per-read.
- [x] **5.3** Question paper generator wizard frontend — 6 steps inside `<GlassCard>` with Teacher Orange hero + horizontal pill stepper + Brand Flame primary CTAs. Step 1: free-text portions + "Whole syllabus" toggle (visual chapter picker deferred — backend needs `GET /syllabus/:id/chapters`). Step 2: question types builder with live marks calculator + difficulty mix (sum 100). Step 3: sample paper picker (max 5, AI_READY only). Step 4: 2s setTimeout-chain polling against `/jobs/:id` with Deep AI Glow progress card + 5-milestone ticker. Step 5: PaperPreview (left) + sticky sidebar (right) with AI confidence badge + Radix edit drawer + regenerate dialog. Step 6: read-only preview + export button + dual PDF downloads + publish confirm modal. `sessionStorage`-persisted wizard state keyed by classroomId.

### Sprint 5 deviations from the Playbook

- **`POST /regenerate-question` returns 200 synchronously** (not 202) — bounded LLM call, teacher's waiting on the edit UI. Not in original prompt but Playbook Prompt 21 mentions "regenerate individual questions" as a wizard feature.
- **PDF font is Helvetica** (built-in to `@react-pdf/renderer`), not Inter. `Font.register` with Google Fonts CDN URL works but adds a network dep at render time. Switch in Sprint 5.4 polish.
- **Frontend portions = free-text input**, not visual chapter picker. Backend doesn't expose `GET /syllabus/:id/chapters`; case-insensitive substring match handles fuzziness; "Whole syllabus" toggle sends `["Whole syllabus"]` and the worker falls back to first 40 chunks.
- **Wizard state in `sessionStorage`**, not server-side draft persistence. Cleared on successful publish. Cross-classroom isolation via the storage key.

### Sprint 4 progress (complete — 4 of 4 sessions)

- [x] **4.1** `packages/ai/` service layer — OpenAI + Anthropic clients (wrapped as `@Injectable()` mirroring SupabaseService), `EmbeddingsService` (text-embedding-3-small, batched at 96), `VectorStoreService` (raw SQL via `$queryRaw` against pgvector with `<=>` cosine; single chokepoint hard-codes `institution_id` + `namespace` WHERE), `RagService` (embed query → search → assemble context with citation metadata), `ChatService` (streaming via AsyncIterable + complete()), Sprint 4 system prompt + extractCitations helper, `pricing.ts` constants, `gpt-tokenizer`-based token utils. HNSW index migration on `vector_embeddings.embedding`.
- [x] **4.2** Syllabus worker — calls `EmbeddingsService.embedBatch` + `VectorStoreService.upsert` after chunking; writes `AiUsageLog` row for the batch (`operation: 'embedding'`, `costUsd` computed from `EMBEDDING_PRICE_USD_PER_1M_TOKENS`); reprocess endpoint now clears the namespace via `deleteByNamespace` before re-enqueue.
- [x] **4.3** `apps/api/src/modules/ai-chat/` — 4 endpoints under `/api/v1/classrooms/:id/ai/...` (POST session, GET sessions list, GET session detail, POST stream chat). SSE via POST + manual `res.write('event:...\\ndata:...\\n\\n')` so pre-flight `HttpException`s (401/403/404/412/402) materialize as JSON envelopes before headers flush. Credit guard checks `subscription.aiCreditsUsed < aiCreditsMonthly`. Soft-over policy (next request fails closed, current never aborts mid-stream). Every LLM call writes `AiUsageLog` in same try block.
- [x] **4.4** Teacher AI assistant panel — `<AiAssistantTab>` replaces the Sprint 2.3 placeholder inside the classroom detail. Two-column layout (sessions sidebar + chat view; mobile collapses sidebar to a Radix Dialog drawer). Deep AI Glow gradient hero with mandatory disclaimer chip ("AI can make mistakes. Verify important information."). Streaming via `lib/ai-chat-stream.ts` (framework-free `AsyncIterable<ChatStreamEvent>` over fetch + ReadableStream). Auto-scroll-near-bottom heuristic + "Jump to latest" sticky chip. Thinking-step ticker (Reading syllabus → Finding relevant content → Generating response) every 700ms until first token. AbortController-backed "Stop generating" button. Quick prompt chips (Summary / Important questions / Lesson plan / Quiz / Explain simply). Citation chips with gold accent. All 5 component states.

### Sprint 4 packaging fix

`packages/ai/package.json` `main` / `types` / `exports` were originally `./src/index.ts` (matching the other workspace packages). Node can't parse raw TS at runtime — packages/ai is the FIRST workspace package consumed by `apps/api` at runtime. Fix: point `main` at `./dist/index.js`, `types` at `./dist/index.d.ts`, and an `exports` field with `types`/`import`/`require`/`default` keys. **Workflow change:** when editing `packages/ai/src/**`, run `npm run build --workspace=@vaasenk/ai` before booting `turbo dev` (or run it once and let watch reload). Future packages with runtime code should follow the same pattern.

### Sprint 4 AI orchestration decision (validated 2026-05-23)

Sprint 4 uses **bare OpenAI + Anthropic SDKs wrapped in NestJS services**, NOT Flowise/Langflow, NOT heavy LangChain chain orchestration. Validated by an AI Engineer review against Vaasenk's specific constraints:

- **Schema constraints favor code.** `VectorEmbedding.namespace`, `AiUsageLog` columns, and the `syllabus.worker.ts` single-transaction chunk+embedding write are all incompatible with Flowise's HTTP-hop model.
- **Multi-tenancy (CLAUDE.md §3) is enforced at compile time** by every public `packages/ai/` function taking `institutionId: string` as a mandatory first parameter; vector queries route through a single `VectorStoreService.search()` chokepoint that hard-codes the institution + namespace WHERE filter.
- **Cost tracking writes to `ai_usage_logs` in the same try block as the LLM call**, so partial usage is always captured.
- **LangChain.js was avoided entirely.** Plain OpenAI + Anthropic SDKs + `gpt-tokenizer`. Chain orchestration is plain TypeScript.
- The "hybrid Flowise-for-prompt-iteration" alternative doesn't match a 2-3 person team where the backend dev IS the prompt iterator. Prompts live as TypeScript template files in `packages/ai/src/prompts/` (code-reviewable, type-checked, CI-tested).

### Sprint 4 AI orchestration decision (validated 2026-05-23)

Sprint 4 uses **bare OpenAI + Anthropic SDKs wrapped in NestJS services**, NOT Flowise/Langflow, NOT heavy LangChain chain orchestration. Validated by an AI Engineer review against Vaasenk's specific constraints:

- **Schema constraints favor code.** `VectorEmbedding.namespace`, `AiUsageLog` columns, and the `syllabus.worker.ts` single-transaction chunk+embedding write are all incompatible with Flowise's HTTP-hop model.
- **Multi-tenancy (CLAUDE.md §3) is enforced at compile time** by every public `packages/ai/` function taking `institutionId: string` as a mandatory first parameter; vector queries route through a single `VectorStoreService.search()` chokepoint that hard-codes the institution + namespace WHERE filter.
- **Cost tracking writes to `ai_usage_logs` in the same try block as the LLM call**, so partial usage is always captured.
- **LangChain.js is OPTIONAL at the edges** (embedding utilities, document loaders) — chain orchestration is plain TypeScript.
- The "hybrid Flowise-for-prompt-iteration" alternative doesn't match a 2-3 person team where the backend dev IS the prompt iterator. Prompts live as TypeScript template files in `packages/ai/src/prompts/` (code-reviewable, type-checked, CI-tested).

### Sprint 3 progress (complete — 3 of 3 sessions)

- [x] **3.1** Syllabus backend module + worker — POST/GET/PATCH/map/reprocess + BullMQ `syllabus` queue with pdf-parse + chunking (~500-token / ~2000-char chunks with paragraph/sentence boundary preference) → `syllabus_chunks`. File replacement creates new SyllabusDocument version transactionally.
- [x] **3.2** Sample papers backend module + worker — POST/GET/PATCH/reprocess/DELETE with exam_type/year/term + BullMQ `sample-papers` queue extracting full text to `extractionMeta.textContent` (no chunking — sample papers are pattern-extracted in Sprint 5).
- [x] **3.3** Admin syllabus library frontend — `/admin/syllabus` Admin Royal hero + grid/list view toggle + status chips + board filter + archived toggle + cards with status badges (gray/amber/green/red + icons + tooltips) + upload-or-replace drawer (single component, discriminated `mode` prop) + map-classrooms add-only dialog + detail drawer with processing-timeline stepper. Shared `xhrUpload` helper factored to `apps/web/src/lib/xhr-upload.ts`; teacher note upload migrated to use it.

### Sprint 3 deviations from the Playbook

- Sample-paper soft delete uses `extractionMeta.deletedAt` (no `ARCHIVED` value on `ProcessingStatus`). A schema migration adding a `Status` column to `SampleQuestionPaper` is a Sprint 4+ follow-up if archival tightening is needed.
- Sample-paper file replacement is in-place (single row reset to UPLOADED), not new-version-row like syllabus — sample papers have no `version`/`isActive` fields, so syllabus-style versioning would orphan data.
- Frontend defers `classId` / `subjectId` selectors in the upload form — backend `GET /classes` and `GET /subjects` list endpoints don't exist yet (only the institution-setup-wizard create endpoints). Form rows are rendered disabled with a "Sprint 3.4 pending" hint. Backend follow-up: add tiny list endpoints.
- Detail surface is a Radix Dialog drawer at 640px, not a `/admin/syllabus/[id]` route. Promotable when deep-linking demand arrives.
- Map dialog is add-only (no unmap). Backend's `POST /:id/map` calls `updateMany` which sets but doesn't unset; unmap is `PATCH /classrooms/:id { syllabusId: null }` — wire in Sprint 3.4 polish.

### Sprint 2 deviations from the Playbook

- `POST /api/v1/classrooms/join` (no `:id`) — Playbook says `POST /classrooms/:id/join` but students don't know the UUID, only the invite code. Mounted without the id segment; `inviteCode` lives in the body. Route order in the controller puts this above the `:id` catch-all.
- Note "soft delete" sets `status: ARCHIVED` (Note has no `deletedAt` column — soft-delete is modeled via NoteStatus enum). Storage object retained for admin restore.
- Student feed filter chips include all 6 NoteTag values, not the 5 named in Playbook Prompt 14 ("All, Important, Homework, Exam, Revision"). Adds FORMULA and ASSIGNMENT for symmetry with the teacher view and full filter surface.
- Student note viewer uses an `(viewer)` route group at the same URL path to bypass the dashboard sidebar/topbar — full-viewport focused experience with sticky top + bottom bars.
- PDF viewer is an `<iframe src={signedUrl}>` (browser-native), NOT `react-pdf`. Saves ~200 kB; native PDF UI is sufficient for v1 reading. Image viewer uses `react-zoom-pan-pinch` for pinch/scroll zoom.

### Sprint 1 deviations from the Playbook

- `PATCH /api/v1/institutions/:id` is used instead of the `PUT` in Playbook Prompt 6, per CLAUDE.md §7 (project naming convention) and because `UpdateInstitutionDto` is fully partial.

---

## 9. Session Protocol for Claude Code

```
EVERY SESSION:
1. Read this CLAUDE.md first
2. Check Sprint Tracker above — work ONLY on current sprint
3. Read the relevant prompt from docs/Vaasenk_Development_Playbook.md
4. Execute the task within the boundaries of this file
5. Run lint + typecheck after changes
6. Update Sprint Tracker when feature is complete

NEVER DO:
- Override a Locked Technical Decision without human approval
- Write queries without institutionId scoping
- Hardcode colors/spacing — always use design tokens
- Create UI without all 5 states (default, loading, empty, error, disabled)
- Call AI providers directly from apps — go through packages/ai/
- Skip input validation
- Work on a future sprint's features
```
