# Vaasenk Web App — Spec Overview & MVP Cut List

**Date:** 2026-05-21
**Status:** Draft for review
**Owner:** xebecdev / nuke0306

---

## 1. What this document set is

This folder is the single source of truth for the Vaasenk Web App build. The four PRDs in `/Docs` and the token package in `/Design-doc` are the upstream inputs; the documents here are the **operational specs** the implementation will be built against.

Read order:

| # | File | Purpose |
|---|------|---------|
| 00 | `00-overview-and-mvp-cut-list.md` (this file) | Locks scope, build order, terminology. |
| 01 | `01-web-app-architecture-spec.md` | Frontend architecture, routing, tenancy enforcement, data layer. |
| 02 | `02-design-system-and-component-library-plan.md` | Visual system, primitives, gradient/glass rules. |
| 03 | `03-admin-console-spec.md` | Every Admin MVP screen, by section. |
| 04 | `04-teacher-workspace-spec.md` | Teacher dashboard + classroom + the two AI differentiators. |
| 05 | `05-ai-chatbot-and-rag-integration-spec.md` | Server-side AI orchestration contract. |
| 06 | `06-data-model-and-multi-tenancy-spec.md` | Postgres + pgvector schema. |

## 2. Product summary

Vaasenk is a multi-tenant edtech SaaS for Indian schools, colleges, and coaching centers. Tagline: **"Teach more. Copy less."** Students stop wasting class time copying board notes; teachers upload photos/PDFs/text; the platform processes, organises, and (for teachers) layers RAG-grounded AI on top.

Three roles, distinct primary surfaces:

- **Admin** — web-first. Owns institution setup, syllabus library, sample-paper library, classroom mapping, billing, user provisioning.
- **Teacher** — web + mobile. Uploads notes, runs the **AI Question Paper Generator**, talks to the **classroom-scoped AI Chatbot**.
- **Student** — mobile-first. Web is read-only and minimal in MVP. Consumes notes, bookmarks, downloads.

**Differentiators (must work in MVP):**
1. Classroom-scoped teacher-only AI chatbot grounded in admin-uploaded syllabus + sample papers (RAG).
2. AI question paper generator that uses syllabus + sample paper patterns to produce structured, editable papers.

## 3. Locked decisions

These are not up for re-debate during implementation. If a doc downstream contradicts them, this file wins.

| Area | Decision |
|------|----------|
| Visual identity | Warm red-gold gradient/glassmorphism system from `/Design-doc/`. Web PRD §15 blue palette is **deprecated**. |
| Brand colors | `#A00000` (Vaasenk Red), `#FECA02` (Learning Gold). Mandatory. |
| Web stack | Next.js (App Router) + TypeScript + Tailwind v4 + ShadCN primitives. |
| Backend stack | Node.js (NestJS preferred; Express acceptable) + PostgreSQL + pgvector + Redis + BullMQ + S3-compatible storage. |
| AI orchestration | Server-side only. Frontend NEVER calls AI providers directly. Engine choice (Flowise / Langflow / custom) abstracted behind a backend interface — see spec 05. |
| Multi-tenancy | Every domain table carries `institution_id`. Every AI retrieval is namespaced by `(institution_id, classroom_id|syllabus_id)`. RLS strategy in spec 06. |
| Phase 1 chatbot transport | Full-response (non-streaming) for MVP. SSE/streaming deferred. |
| Phase 1 student web | Web-light only: home, classrooms, notes feed, viewer, bookmarks, join. No assignments, doubts, AI. |
| Mode default | Light mode only in MVP. Dark mode deferred. |
| Single-institution per user | MVP. Multi-institution switching is post-MVP. |

## 4. Phase 1 (UI MVP) cut list

Build these as fully-designed, statically-wired screens consuming a mock data layer (typed fixtures). Backend wiring happens in Phase 2 against the same data shapes.

### Foundation
- Next.js + TS + Tailwind v4 scaffold importing both `vaasenk.theme.css` and `vaasenk.tailwind.theme.css`.
- 16 token-backed primitives (see spec 02): Button, GlassCard, HeroCard, RoleCard, Input, Textarea, Select, Chip, Tabs, Modal, Drawer, BottomSheet, Toast, ProgressRing, StatusBadge, EmptyState, SkeletonLoader.
- Role-aware shell (TopNav + Sidebar + RoleGate + middleware).
- Mock data layer with typed fixtures aligned to spec 06 schemas.

### Auth & shared
Login, role-select, forgot-password, invite-accept, notifications drawer, profile shell, settings shell.

### Admin (web-first)
Dashboard, Onboarding Wizard (6 steps), Academic Structure pages (years/classes/sections/subjects), Teacher Mgmt, Student Mgmt, Classroom List + Create Wizard + Detail, Syllabus Library + Upload + Detail, Sample Paper Library + Upload + Detail, AI Processing Monitor, Billing (read-only), Users & Roles.

### Teacher
Dashboard, My Classrooms grid, Classroom Detail with tabs (Notes / Question Papers / AI Assistant / Students / Settings), Upload Note Drawer, **Generate Question Paper Wizard** (6 steps), **AI Chatbot screen** with prompt chips + citations + disclaimer + indexing-state empty state, Notifications.

### Student (web-light)
Home, Classrooms, Notes Feed, Note Viewer, Bookmarks, Join Classroom modal.

### Polish
Empty/loading/error/permission-denied states; reduced-motion respect; keyboard nav + focus rings; Storybook for primitives.

### Explicitly out of Phase 1
Analytics charts, audit log UI, announcements composer, assignments/quizzes authoring, doubt management UI, annotation tools, data export, real backend, real AI calls.

## 5. Terminology

| Term | Meaning |
|------|---------|
| **Institution** | A school, college, or coaching center tenant. Tenancy root. |
| **Academic Year** | Time-bounded scope for classes (e.g., "2025-26"). |
| **Class** | A grade/standard (e.g., "Class 10", "B.Sc 1st Year"). |
| **Section** | A subdivision of a class (e.g., "10-A"). |
| **Subject** | A taught subject (e.g., "Physics"). |
| **Classroom** | The atomic unit: `(class, section, subject, teacher, academic_year)`. Owns notes, papers, AI bot. |
| **Note** | Any content a teacher uploads to a classroom: image, PDF, or text. |
| **Syllabus Document** | Admin-uploaded curriculum PDF, mapped to one or more classrooms. RAG knowledge source. |
| **Sample Paper** | Admin-uploaded past/model paper. Pattern source for question generation. |
| **AI Knowledge Base** | The vector collection derived from syllabus + sample papers for a classroom. |
| **Classroom Bot** | The teacher-only chatbot scoped to one classroom's knowledge base. |
| **Generated Paper** | Structured output of the question paper generator (sections → questions). |
| **Invite Code** | 6-char alphanumeric code students use to join a classroom. |

## 6. Open items (resolve before backend phase)

These are tracked but NOT blockers for Phase 1 UI:

- AI engine choice (Flowise vs Langflow vs custom).
- Auth method: email+password vs phone+OTP — affects login screen final shape.
- Generated paper export PDF styling (school logo, header conventions).
- OCR pipeline for handwritten board photos (Tamil + English mixed) — the riskiest input.

## 7. Success criteria for Phase 1

The Phase 1 build is "done" when:

1. All screens listed in section 4 render with mock data, in all designed states.
2. A first-time visitor can navigate Admin onboarding → Teacher dashboard → upload note → run AI chatbot → generate paper — entirely on mocks — without dead ends.
3. The 16 primitives are documented in Storybook with all states.
4. Lighthouse desktop accessibility ≥ 90, mobile ≥ 85.
5. The mock data layer's TypeScript types match the schemas in spec 06 so Phase 2 backend swap-in is a service-layer change, not a UI change.
