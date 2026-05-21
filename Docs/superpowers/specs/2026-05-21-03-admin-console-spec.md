# 03 — Admin Console Spec

**Date:** 2026-05-21
**Status:** Draft for review
**Depends on:** `00`, `01`, `02`, `06`

---

## 1. Admin shell

- TopNav: institution name + role badge (Admin) + notifications bell + profile.
- Sidebar (collapsible, persistent on desktop ≥ 1024px; drawer on mobile):
  - Dashboard
  - Setup (only visible when onboarding checklist incomplete)
  - Academic (years / classes / sections / subjects)
  - Teachers
  - Students
  - Classrooms
  - Syllabus
  - Sample Papers
  - AI (processing / usage)
  - Billing
  - Users & Roles
  - Settings
- Footer of sidebar: tiny help link + version stamp.
- Sidebar uses **deep maroon → red** as the active-item gradient bar; idle items are ink on cream.

## 2. Dashboard (`/app/admin/dashboard`)

**Purpose:** Institution health overview + setup guidance.

Layout, top to bottom:

1. **Hero greeting card** (`HeroCard`, red-glow): "Good morning, {admin}." + institution name + tagline. CTA: "Open setup checklist" (if onboarding incomplete) or "View today's activity" (if complete).
2. **Setup checklist** (`GlassCard`, hide if all complete): 6 items (Institution profile / Academic year / Classes & subjects / Teachers / Students / First syllabus) with check states and inline "Continue" link to the relevant wizard step.
3. **Stat tiles** (4-up grid; collapses to 2x2 mobile):
   - Classrooms (count + delta this week)
   - Teachers (count + active this week)
   - Students (count + joined this week)
   - AI jobs (count + failed count, click → AI processing)
4. **AI knowledge status** panel (`GlassCard`):
   - Syllabus documents: total, AI Ready, Processing, Failed.
   - Sample papers: same.
   - Inline CTA: "Upload syllabus" / "Open processing monitor."
5. **Recent activity feed** (`GlassCard`):
   - Last 10 institution-level events: classroom created, syllabus uploaded, teacher invited, AI job failed, etc.
   - Time-relative timestamps.
6. **Alerts banner row** (top of page if any): subscription expiry, storage near limit, AI quota near limit, any Failed AI job > 24h old.

**States:**
- First-run (no data at all): hero CTA dominates, stat tiles show "—", a single illustrated EmptyState card with "Let's set up your institution."
- Subscription expired: top banner (warning color) + every write action shows tooltip "Renew subscription to continue."
- Network error: stat tiles independently fail and show inline retry; hero remains.

## 3. Onboarding wizard (`/app/admin/setup/[step]`)

Six steps, full-page (not modal):

| Step | Path | Content |
|------|------|---------|
| 1 | `/setup/institution` | Institution name, type (School / College / Coaching), board (CBSE / ICSE / State / University / Custom), address, principal contact. |
| 2 | `/setup/academic-year` | Year name (e.g., "2025-26"), start date, end date, mark as active. |
| 3 | `/setup/classes` | Add classes + sections in a table editor (e.g., Class 10 → A, B, C). Quick-add row. |
| 4 | `/setup/subjects` | Add subjects, optionally per class. |
| 5 | `/setup/teachers` | Invite teachers (email or phone), select subjects, multi-row form, optional CSV import. |
| 6 | `/setup/syllabus` | Upload first syllabus PDF — same flow as syllabus upload (§7). |

Persistent right-rail (desktop): step list + progress indicator + estimated time.
Mobile: step list collapses to a top progress bar.

**Save behaviour:** every step autosaves on field blur; "Continue" navigates. Back never destroys data.
**Skip:** every step has "Skip for now" (except step 1). Skipped steps keep their checklist item un-ticked.
**Complete:** step 6 leads to `/app/admin/dashboard` with a success toast.

## 4. Academic structure (`/app/admin/academic/*`)

Four sibling pages with a common layout: page title + "Add" button (opens a Drawer form) + filterable table.

- **Years**: list, set active, archive.
- **Classes**: list with grade level, board type filter.
- **Sections**: list (filter by class), bulk add.
- **Subjects**: list, code, optional class scoping.

Tables use a single primitive (`DataTable` composite) shared across admin.

## 5. Teachers (`/app/admin/teachers`)

- Table: name, email/phone, subjects, classrooms count, status (Active/Pending/Inactive), actions.
- Primary CTA: "Invite teacher" → right Drawer with form (multi-row).
- Bulk CSV import (Phase 1 UI; backend in Phase 2): button → modal with file drop, validation table preview, "Import N teachers."
- Row click → teacher detail page (`/teachers/[id]`): profile + assigned classrooms + invite resend + deactivate.

## 6. Students (`/app/admin/students`)

Same structural pattern as Teachers, with additional filters (class, section) and bulk import.

## 7. Syllabus library (`/app/admin/syllabus`)

### List view
- Filters: board, class, subject, year, status.
- Card grid (not table): each card shows file icon, title, board/class/subject chip row, version, **StatusBadge** (Uploaded / Processing / AI Ready / Failed / Archived), mapped-classrooms count.
- Empty state: illustrated, with "Upload first syllabus" CTA.
- Primary CTA: "Upload syllabus" → modal (§7.2).

### 7.2 Upload modal
Single-page modal, no wizard:

1. File drop or browse (PDF only; show file name + size; replace allowed).
2. Metadata form: title, board, class, subject, academic year, version (autodetect from filename if possible), language (English/Tamil/Hindi/Mixed).
3. Mapping (optional, can be done later): multi-select classrooms.
4. Confirm → starts upload to signed S3 URL → modal closes → toast "Uploading…" → card appears in list with `Uploaded` status → transitions to `Processing` (mock simulates this on a timer in Phase 1) → `AI Ready` (with gold-glow micro-celebration) or `Failed`.

### 7.3 Syllabus detail (`/app/admin/syllabus/[id]`)

- Header: title, status badge, board/class/subject chips, version selector.
- Tabs:
  - **Overview**: metadata, file preview thumbnail, mapped classrooms list with quick-unmap.
  - **AI Status**: processing job timeline (Uploaded → Extracting → Chunking → Embedding → AI Ready or Failed), with per-step duration and (on Failed) human-readable reason + Retry button.
  - **Versions**: previous versions with restore.
- Destructive: Archive (soft-delete; classrooms relying on it warn).

## 8. Sample papers (`/app/admin/sample-papers`)

Mirrors Syllabus library. Additional fields on upload: exam type (Mid-term / Annual / Board / Custom), year, term, priority (used to rank in AI generation).

Sample paper detail adds: linked syllabus (chosen at upload), parsed pattern summary (Phase 2 will populate; Phase 1 shows "Pattern analysis pending").

## 9. Classrooms (`/app/admin/classrooms`)

### List
Card grid: class+section, subject, teacher (avatar+name), student count, AI bot status (`StatusBadge`), invite code.

### Create wizard (`/app/admin/classrooms/new`)
6 steps, full-page like setup wizard:

1. **Basics**: select class, section, subject, academic year.
2. **Teacher**: pick from existing teachers (filtered by subject).
3. **Students**: add by email/phone or generate invite code only.
4. **Syllabus**: pick from library (filtered by class+subject), or "Upload new" inline.
5. **Sample papers**: pick from library (optional, multi).
6. **Review & create**: summary, invite code preview, "Create classroom."

After create → redirect to classroom detail with success banner; AI bot status begins at `Indexing syllabus…` (or `Setup pending` if no syllabus was mapped). See spec 04 §4 for the full bot-status vocabulary.

### Classroom detail (`/app/admin/classrooms/[id]`)
- Header: class info + status + invite code (copyable).
- Tabs:
  - **Overview**: teacher, students count, mapped syllabus and sample papers, AI bot status, recent notes count.
  - **Members**: students table + add/remove.
  - **Syllabus & Papers**: re-map.
  - **AI Bot**: enable/disable, override quota, see chat session count, see last activity.
  - **Activity**: audit-like recent events.
  - **Settings**: rename, archive.

## 10. AI processing monitor (`/app/admin/ai/processing`)

Single page; the operational heart of the admin's AI experience.

- Filters: document type (syllabus / sample paper), status, date range, classroom.
- Table: document title, type, current stage, status, duration, started by, error reason (if Failed), Retry button.
- Realtime feel (Phase 1: polling every 5s on the mock fetcher; Phase 2: WebSocket or SSE).
- Bulk select → bulk retry.
- Click row → drawer with full job timeline + raw logs (Phase 1 shows mock log lines).

## 11. AI usage (`/app/admin/ai/usage`)

- This-month panel: tokens consumed, jobs run, chat sessions, papers generated. Each with quota bar and projected end-of-month.
- Breakdown by classroom (table).
- Adjustable quotas: soft alert at X%, hard cap at Y%.

## 12. Billing (`/app/admin/billing`)

Phase 1 read-only:
- Current plan card (name, included quotas, monthly cost).
- Usage summary tying back to AI Usage.
- Invoice list (mock data).
- "Contact sales to change plan" CTA.

Phase 2 adds payment integration.

## 13. Users & Roles (`/app/admin/users-roles`)

- Roles table: default roles (Admin / Teacher / Student) + permission matrix.
- Custom role creation (Phase 2; UI placeholder in Phase 1).
- Per-user role override list.

## 14. Settings (`/app/admin/settings`)

Tabs:
- **Branding** (Phase 2 — placeholder)
- **Academic** (Phase 1 — defaults like academic year)
- **Notifications** (Phase 1 — channels, frequencies)
- **Downloads** (Phase 1 — allow/disable student downloads policy)
- **AI** (Phase 1 — toggle features, set quota defaults)
- **Security** (Phase 1 — session length, password policy)
- **Danger zone** (Phase 2 — institution archive)

## 15. Cross-cutting behaviors

- Every list page implements URL-state filters (deep-linkable).
- Every destructive action uses a `Modal` confirm with the action name typed back.
- Every form supports keyboard submit (Enter on last field; never Enter inside textarea).
- Mobile: sidebar collapses to drawer; tables collapse to card lists; modals become full-screen sheets.
- Subscription-expired: all write CTAs disabled with tooltip; reads remain.
