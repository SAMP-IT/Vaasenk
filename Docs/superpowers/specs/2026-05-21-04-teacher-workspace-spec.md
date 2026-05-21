# 04 — Teacher Workspace Spec

**Date:** 2026-05-21
**Status:** Draft for review
**Depends on:** `00`, `01`, `02`, `05`, `06`

---

## 1. Teacher shell

- TopNav: institution name (small) + role badge (Teacher, orange) + quick actions (Upload Note ▸ Drawer; Ask AI ▸ navigates to current classroom's chatbot if exactly one classroom is active, else opens a picker) + notifications + profile.
- No persistent sidebar. Teacher navigation is content-first; primary navigation lives in the dashboard hero and inside each classroom.
- Mobile: bottom nav with 4 tabs — Home / Classrooms / Upload (FAB) / AI / Profile.

## 2. Dashboard (`/app/teacher/dashboard`)

The teacher dashboard is **the most expressive screen in the app** — sets the productivity-and-confidence tone. Generous spacing, one hero, gradient accents.

Layout:

1. **Greeting hero** (`HeroCard`, `red-glow` gradient with subtle ambient flow): "Good morning, {teacher}." + today's date + a single most-important next action (e.g., "3 students joined Class 10-A — open classroom" or "Question paper draft ready for review").
2. **My Classrooms** strip: horizontal scroll of `ClassroomCard`s (3 visible desktop / 1.5 mobile). Each card: subject icon + class+section + student count + AI bot status dot + last activity timestamp + "Open" CTA. Card uses cream-card surface with the role's gradient as a thin top accent strip.
3. **Quick actions row** (3 cards):
   - **Upload note** (red gradient accent) → opens Upload Drawer (§5).
   - **Generate paper** (gold gradient accent) → opens a picker for which classroom to generate in, then routes to the wizard.
   - **Ask AI assistant** (red-glow accent) → picker + routes to chatbot.
4. **Recent uploads** list (`GlassCard`): last 8 notes across all classrooms, with thumbnail, classroom chip, tag chips, view count (Phase 2 stat — show "—" in Phase 1).
5. **Pending doubts** counter card (Phase 2 — placeholder in Phase 1).

States:
- First-run (no classrooms): greeting hero with CTA "You're not assigned to any classroom yet. Ask your admin for a classroom code." + EmptyState.
- Single classroom: cards lose the horizontal-scroll affordance; the single classroom expands to full width.

## 3. My Classrooms (`/app/teacher/classrooms`)

Grid of `ClassroomCard` (3-up desktop, 1 mobile). Sort: most recently active first. Filter: subject, status. Search by name.

## 4. Classroom detail (`/app/teacher/classrooms/[id]`)

Tabbed interface (URL `?tab=notes|papers|ai|students|settings`, default `notes`):

### Header (shared across tabs)
- Class+section, subject, teacher avatar.
- **AI bot status chip**: explicit text + color + icon — `AI Ready` (gold) / `Indexing syllabus…` (warning, pulse) / `Bot disabled by admin` (muted) / `Setup pending — no syllabus mapped` (warning + tooltip explaining).
- Invite code (copyable).
- Tabs row.

### Tab: Notes
- Top action row: "Upload note" (primary, opens drawer) + sort/filter.
- Notes feed:
  - Grouped by date (Today / Yesterday / This week / Earlier).
  - Each note: thumbnail (PDF / image / text icon) + title + tag chips + visibility chip (Draft/Published) + timestamp + overflow menu (Edit / Archive / Delete).
  - Click → note detail (preview + metadata + actions).
- Empty: "No notes yet. Upload your first one." with illustration + CTA.

### Tab: Question Papers
- List of generated papers + "Generate question paper" CTA (primary).
- Each paper: title, generated-from chips (syllabus, sample papers used), generated date, status (Draft / Reviewed / Published / Exported), confidence score (Phase 2 — show "—" in Phase 1), overflow (Edit / Regenerate / Export PDF / Duplicate / Delete).
- Click → paper preview/editor (§7).

### Tab: AI Assistant
- See §8.

### Tab: Students
- Roster table. Phase 1: read-only. Phase 2: remove student / resend invite.

### Tab: Settings
- Classroom name override (display only), notifications preferences for this classroom, download toggle (Phase 2), archive.

## 5. Upload note drawer

Triggered from: TopNav Upload Note, Classroom Notes tab CTA, dashboard Quick Action.

Right-side `Drawer` (mobile: BottomSheet). Sections, top to bottom:

1. **Target classroom selector** (auto-filled when launched from inside a classroom; required otherwise).
2. **File area**: drag-drop or browse. Accepts JPG, PNG, PDF, plain text. Max 25MB Phase 1. Multi-file allowed.
3. **Preview**: thumbnail of each file with quick crop hint (Phase 2: in-line cropper; Phase 1: shows the image / first page).
4. **Title** (required; auto-suggested from filename).
5. **Description** (optional, multiline).
6. **Tags**: chip multi-select from preset list — Important / Homework / Revision / Formula / Assignment / Exam + classroom chapter tags (Phase 2).
7. **Visibility radio**: Draft (only me) / Publish (students see immediately).
8. **Actions row**: Save as Draft (secondary), Publish (primary).

Submission:
- Upload to signed S3 URL (Phase 1: mock returns success after 1s).
- Toast "Note uploading…" → updates to "Published" or "Saved as draft" on completion.
- Drawer closes; notes list refetches; new note appears at top of Today group.
- On failure: drawer reopens with error inline, file content preserved.

## 6. AI Question Paper Generator (`/app/teacher/classrooms/[id]/papers/generate`)

**This is the platform differentiator. It must feel expensive, exact, and trustworthy.**

Wizard, full-page, 6 steps. Right-rail step indicator (desktop) / top progress bar (mobile). Each step is keyboard-navigable; Continue is disabled until step's required fields validate.

### Step 1 — Portion
- Pick chapters/topics from the classroom's mapped syllabus (Phase 1: mock tree of chapters → topics).
- Multi-select with chapter weighting sliders (optional — default equal weight).
- Selected count + estimated paper coverage shown live.
- Validation: at least one selection.

### Step 2 — Pattern
- Exam type: Mid-term / Annual / Practice / Custom.
- Total marks (numeric).
- Duration (minutes).
- Difficulty mix: 3 sliders — Easy / Medium / Hard summing to 100% (auto-balance).
- Question-type mix: select types with counts — MCQ, Short Answer, Long Answer, Numerical, Diagram-based, Case Study. Each row has count + per-question marks. Live total tally with green tick when total matches.
- Validation: type-total × per-q-marks = total marks (small "Marks don't add up — adjust counts" inline error when wrong).

### Step 3 — Sample paper guidance
- 3 options: None / All relevant sample papers / Pick specific.
- Pick specific → multi-select from the classroom's mapped sample papers.
- Helper text: "Sample papers shape question style and difficulty distribution. Syllabus content is always the authority."

### Step 4 — Generate
- Summary of choices (one card).
- Big "Generate paper" button → submits.
- Progress state replaces the page: a centered `ProgressRing` with 4 sequential text labels:
  - "Preparing syllabus context…"
  - "Analysing sample paper patterns…"
  - "Drafting questions…"
  - "Formatting output…"
- Each label fades in as it begins; the previous one gets a checkmark.
- ETA shown ("~30 seconds left"). Cancel allowed.
- On failure: explicit reason + Retry + "Edit parameters."

### Step 5 — Review & edit
- Two-pane on desktop (right = paper preview, left = editor); single-column on mobile.
- Paper structure: Sections → Questions. Each section is collapsible.
- Per question: marks badge + question type chip + question text + (optional) answer + AI confidence dot.
- Inline edits: every text field is editable. Drag-to-reorder questions within a section.
- Per-question actions: Regenerate this question (lightweight re-call), Replace with different question (lightweight re-call), Delete, Move to section, Mark for review.
- Per-section actions: Add question (manual), Regenerate section, Move section, Delete section.
- Right rail: live total marks + total question count + Section balance check + "X questions flagged."

### Step 6 — Export & save
- Export options: PDF (with optional answer key), DOCX (Phase 2), publish to classroom as a note (optional).
- Save to library (always happens automatically on completing step 5).
- Success card: "Paper saved" + buttons "View paper" / "Generate another."

**Constraints (must be enforced in UI):**
- Syllabus is authoritative — if a generated question references content outside the selected portion, badge it for teacher review.
- AI-generated content must always carry a small "AI-generated — verify before use" footer in exports.
- No question paper can be published to students without explicit teacher action (publish is opt-in, not default).

## 7. Generated paper viewer (`/app/teacher/classrooms/[id]/papers/[paperId]`)

Same two-pane editor as step 5 of the wizard, with extra actions: Export, Duplicate, Regenerate from same params, Delete, Publish to classroom as note.

## 8. Teacher AI Chatbot (Tab: AI Assistant)

**The other differentiator. Must look and feel like a confident teaching companion, not a generic chat UI.**

### Layout
Two-column on desktop (left = session list, right = active chat). Mobile collapses sessions into a top drawer.

### Sessions panel (left)
- "New chat" CTA (primary).
- Sessions list: each item shows auto-generated title (first message excerpt), date, message count.
- Search.
- Long-press / overflow: Rename, Delete.

### Active chat (right)
**Empty / new chat state** is critical — sets expectations:
- Hero greeting card with chatbot's purpose: "I help you with **{Class 10 Physics}**, grounded in the syllabus and sample papers your admin uploaded."
- **AI Ready badge** at the top (gold) — clearly visible.
- 4 **prompt chips** to start with — picked from a curated list:
  - "Important questions for this chapter"
  - "Make me a lesson plan for {topic}"
  - "Summarise {chapter} in simple language"
  - "Create a quick quiz for {topic}"
- Text input at the bottom with placeholder "Ask about anything from your syllabus…"
- Persistent footer disclaimer: "AI answers are based on your syllabus and sample papers. Verify before using in class or exams."

**Indexing-state empty state** (when AI bot is not Ready):
- Replaces the chat area with `EmptyState` matching the bot's current condition:
  - `Indexing syllabus…` — pulse animation + "Once your syllabus is processed, I'll be ready to help. Usually 2–5 minutes."
  - `Setup pending` — "Your admin hasn't mapped a syllabus to this classroom yet. The AI assistant becomes available once they do." + "Notify admin" CTA.
  - `Bot disabled` — "Your admin has disabled the AI assistant for this classroom." + "Contact admin."

### Message bubbles
- User: right-aligned, cream surface with subtle red border.
- Assistant: left-aligned, glass surface. Title row shows "Vaasenk AI" + small gold dot.
- Assistant message footer: **Source chips** — one chip per cited syllabus/sample-paper chunk: file name + page number. Hover/tap reveals the snippet excerpt. Always shown when present.
- Message actions (on hover): Copy, Save as note draft (drops into classroom Notes as a draft note titled "AI: {first 6 words}"), Convert to paper seed (opens generator wizard pre-filled).

### Input
- Multiline `Textarea` with auto-grow (max 8 lines).
- Send button (icon, gradient).
- Above input: optional "Use context: Chapter X" chip (lets teacher narrow retrieval scope; Phase 2).
- Below input: token estimate (Phase 2) + disclaimer.

### Loading state
- Assistant bubble appears immediately with three dots; full response replaces it when complete (no streaming in Phase 1 per spec 05).
- On error: bubble shows "I couldn't generate an answer — try rephrasing or contact admin if this keeps happening." + Retry icon.

### Safety states (per spec 05)
- "Out of syllabus" answers always include: "This wasn't found in your syllabus. I'm giving a general answer." (UI shows an orange `StatusBadge` on the message.)
- Refusals show as a neutral message with a small icon, never as an error.

## 9. Notifications (`/app/notifications`)

Shared with admin/student layout but populated per role. Teacher notifications:
- Student joined classroom.
- New doubt on note (Phase 2).
- AI job completed (paper generated).
- Note upload failed.
- Admin published new syllabus version affecting your classroom.

Grouped by date. Read/unread visual. Mark all read. Click → routes to relevant page.

## 10. Profile (`/app/teacher/profile`)

- Avatar, name, email/phone, subjects taught, classrooms list.
- Change password (Phase 1).
- Notification preferences.
- Sign out.

## 11. Cross-cutting

- Every teacher-facing destructive action confirms (Modal).
- Drafts are autosaved on textarea blur in upload + paper editor.
- The AI chatbot never appears in the UI when the bot is not Ready — the tab still exists, but its content is the indexing-state EmptyState (no input box visible). This prevents teachers from typing into a void.
- Mobile: every drawer becomes a bottom sheet; the chatbot becomes a single-column experience with the sessions list reachable via a top "Chats" pill.
