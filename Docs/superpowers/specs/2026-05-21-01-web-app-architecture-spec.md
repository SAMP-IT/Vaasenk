# 01 — Web App Architecture Spec

**Date:** 2026-05-21
**Status:** Draft for review
**Depends on:** `00-overview-and-mvp-cut-list.md`

---

## 1. Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Framework | Next.js 15+ (App Router) | RSC for fast initial loads; route groups for role separation; built-in middleware for auth/tenancy. |
| Language | TypeScript (strict) | Schema-aligned types from spec 06 enforce tenancy at the type layer. |
| Styling | Tailwind v4 + the Vaasenk token CSS | Token package is already shipped; Tailwind v4 `@theme` is the native fit. |
| Component primitives | ShadCN/UI (selective) | Use as headless base; restyle with Vaasenk tokens. Do not adopt ShadCN defaults verbatim — they are too generic-SaaS. |
| Data layer | TanStack Query (server-state) + Zustand (UI-state) | Query for cache/refetch/optimistic; Zustand for ephemeral UI (drawer open, wizard step). |
| Forms | React Hook Form + Zod | Schema-first; Zod schemas live next to TS types from spec 06. |
| Icons | Lucide React | Open-source, single-import. |
| Charts (Phase 2+) | Recharts | Defer until Phase 2 (analytics is out of MVP). |
| Tables | TanStack Table | Headless; restyle with Vaasenk. |
| File upload | Native input + custom drag-drop wrapper | No third-party uploader for MVP; we own the UX. |
| PDF rendering | `react-pdf` (pdf.js) | Lazy-load only on viewer route. Known perf concern with large scanned PDFs — see spec 03. |

## 2. Repository layout

```
/web                              # Next.js app (separate package; backend is /api in a future PR)
  app/
    (public)/
      layout.tsx                  # Marketing/auth shell
      page.tsx                    # Landing
      login/page.tsx
      signup/page.tsx
      forgot-password/page.tsx
      invite/accept/page.tsx
      role-select/page.tsx
    (app)/                        # Authenticated shell
      layout.tsx                  # Loads user, enforces auth, mounts shell
      dashboard/page.tsx          # Role-routed redirect
      notifications/page.tsx
      profile/page.tsx
      settings/page.tsx
      help/page.tsx
      admin/                      # Role-gated by middleware + RoleGate
        layout.tsx                # Admin sidebar
        dashboard/page.tsx
        setup/[step]/page.tsx
        academic/{years,classes,sections,subjects}/page.tsx
        teachers/page.tsx
        students/page.tsx
        classrooms/page.tsx
        classrooms/new/page.tsx
        classrooms/[id]/page.tsx
        syllabus/page.tsx
        syllabus/[id]/page.tsx
        sample-papers/page.tsx
        sample-papers/[id]/page.tsx
        ai/processing/page.tsx
        ai/usage/page.tsx
        billing/page.tsx
        users-roles/page.tsx
        settings/page.tsx
      teacher/
        layout.tsx
        dashboard/page.tsx
        classrooms/page.tsx
        classrooms/[id]/page.tsx           # tab router via search params
        classrooms/[id]/papers/generate/page.tsx
        classrooms/[id]/papers/[paperId]/page.tsx
        classrooms/[id]/ai/[sessionId]/page.tsx
        profile/page.tsx
      student/
        layout.tsx
        home/page.tsx
        classrooms/page.tsx
        classrooms/[id]/notes/page.tsx
        classrooms/[id]/notes/[noteId]/page.tsx
        bookmarks/page.tsx
        profile/page.tsx
    api/                          # Next route handlers (BFF only — no business logic)
      auth/[...nextauth]/route.ts
      mock/...                    # Phase 1 only — serves fixtures
  components/
    primitives/                   # The 16 token-backed primitives
    shell/                        # TopNav, Sidebar, RoleGate, RoleBadge
    domain/                       # Feature-aligned composite components
      admin/...
      teacher/...
      student/...
  lib/
    api/                          # TanStack Query hooks (returns typed entities)
    auth/
    mock/                         # Fixtures + mock fetch handlers (Phase 1)
    rbac/                         # Role/permission helpers
    tenancy/                      # institution_id propagation
    formatters/
  hooks/
  styles/
    globals.css                   # @import vaasenk.theme.css + vaasenk.tailwind.theme.css
  middleware.ts                   # Auth + role + tenancy gate
  types/                          # Shared TS types matching spec 06
```

Rationale: route groups `(public)` and `(app)` separate the authenticated shell. Role folders inside `(app)` make middleware role enforcement a path-prefix check, not a per-page check.

## 3. Role gating

Two enforcement layers, both required:

### Middleware (server, edge)
`middleware.ts` inspects the session cookie and the requested path:

- `/app/admin/*` requires `role === 'admin'`.
- `/app/teacher/*` requires `role === 'teacher'`.
- `/app/student/*` requires `role === 'student'`.
- Mismatched role → redirect to `/app/dashboard` (which re-routes to that user's home).
- No session on `/app/*` → redirect to `/login?next=<original>`.
- Subscription expired → redirect write actions to a read-only state via query param `?subscription=expired`; layout reads this and renders a banner. Pages must honour the banner (disable mutations).

### Client (`<RoleGate>`)
Wraps any element that should be visible to only a role subset:

```tsx
<RoleGate allow={["admin"]}>
  <DangerZoneSettings />
</RoleGate>
```

`RoleGate` reads the user from a React context populated by the `(app)/layout.tsx` server component. Fallback prop renders a "Not available for your role" empty state.

## 4. Tenancy enforcement

`institution_id` is derived from the session — **never** from URL params or request body. The server attaches it to every BFF call. Even mock fetchers in Phase 1 must enforce this so the contract is identical when real APIs land.

```ts
// lib/tenancy/withTenant.ts
export function withTenant<T extends (...a: any) => any>(fn: T) {
  return async (...args: Parameters<T>) => {
    const { institutionId } = await getSessionOrThrow();
    return fn({ institutionId, ...(args[0] ?? {}) });
  };
}
```

Every Query hook is wrapped with `withTenant`. Lint rule (custom): direct call to a raw API client without `withTenant` is a build error.

## 5. State management

| State kind | Tool | Examples |
|------------|------|----------|
| Server state | TanStack Query | classrooms list, notes feed, chat sessions, processing jobs |
| Auth/session | RSC + React context | current user, role, institution settings |
| UI ephemeral | Zustand | drawer open, wizard step, selected tab, toast queue |
| Form state | React Hook Form | all forms — never store form state in Zustand |
| URL state | Next.js search params | shareable modals (`?upload-note=1`), pagination, filters |

URL is the source of truth for any view-state that should be shareable or survive refresh.

## 6. Data fetching boundary

**No AI provider may be called from the browser.** Period. The browser only talks to:

1. The Next.js API route handlers (`/web/app/api/*`) — used as BFF in Phase 2; serve mocks in Phase 1.
2. Signed S3 URLs for direct upload/download of file blobs.

All AI orchestration (Flowise/Langflow/custom) sits behind the Node.js backend service and is invoked only from server code. This rule has security and cost implications and is non-negotiable. Linting: `import 'openai'`, `import 'anthropic'`, etc. in `/web/` is a build error.

## 7. Environment variables

| Var | Scope | Phase 1 | Phase 2+ |
|-----|-------|---------|----------|
| `NEXT_PUBLIC_APP_NAME` | public | `Vaasenk` | same |
| `NEXT_PUBLIC_API_BASE_URL` | public | `/api/mock` | `https://api.vaasenk.in` |
| `AUTH_SECRET` | server | dev secret | real |
| `S3_BUCKET`, `S3_REGION` | server | unused | required |
| `SIGNED_URL_TTL_SECONDS` | server | 300 | 300 |
| `AI_ENGINE_URL` | server | unused | Flowise/Langflow endpoint |

`NEXT_PUBLIC_*` is the only prefix exposed to the browser.

## 8. Error and loading conventions

- Every page implements a `loading.tsx` (Skeleton variant matching final layout).
- Every page implements an `error.tsx` (uses `EmptyState` primitive with retry button).
- Every Query hook returns `{ data, isLoading, isError, refetch }` — components handle all three.
- A toast is shown only for user-initiated actions (mutations). Background failures (e.g., a refetch) update an inline alert, not a toast.
- 403 from BFF → `RoleGate` fallback state. 401 → forced re-login.

## 9. Performance budgets

| Surface | Budget |
|---------|--------|
| First Contentful Paint (mobile) | ≤ 1.8s on Slow 4G |
| Largest Contentful Paint (mobile) | ≤ 2.5s |
| Total JS (gzip) per route | ≤ 220 KB |
| Hero gradient animation | Pauses when `prefers-reduced-motion: reduce` |
| PDF viewer route bundle | Code-split; not loaded on any other route |

## 10. Testing

- **Unit (Vitest)**: primitives, formatters, RBAC helpers, mock fetchers.
- **Component (Vitest + Testing Library)**: each domain component in its critical states.
- **E2E (Playwright)** — Phase 1 covers the 7 core journeys from `00-overview` § Core Journeys, all on mock data.
- **Visual (Storybook + Chromatic, optional)**: 16 primitives with each variant.

## 11. Deployment topology (informational; not Phase 1)

Web (Vercel or self-hosted Node) → BFF → Backend API (Node/NestJS) → Postgres (+ pgvector), Redis, S3, AI Engine (Flowise/Langflow/custom). Backend and AI engine live in private network; only the web BFF is internet-facing for the API path.

## 12. Out of scope

- Mobile app (covered by Mobile PRD).
- Backend implementation (referenced; not specced here).
- Real CI/CD pipeline (set up alongside backend phase).
