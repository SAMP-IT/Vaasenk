# Vaasenk Development Playbook
## Building with Claude Code Agents + Skills | 2-3 Person Team

---

## Part 1: Revised Honest Assessment

My earlier review was based on a vanilla 2-3 person team writing code manually. With Agency Agents + Anthropic Skills inside Claude Code, your effective output multiplies roughly 4-8x on scaffolding, boilerplate, CRUD, components, and testing — but stays 1x on architecture decisions, AI pipeline tuning, integration debugging, and product judgment. That changes the math significantly.

**What you CAN build:** The full MVP as specced in your PRD, including both web and mobile, AI features, and the design system — but only if you sequence it correctly and treat Claude Code agents as junior-to-mid engineers who need clear, scoped tasks and architectural guardrails set by you.

**What will still be hard regardless of tooling:**
- RAG quality with Indian educational PDFs (scanned Tamil-English mixed content)
- Multi-tenant data isolation bugs (these are silent and dangerous)
- React Native camera/offline/push notification edge cases on budget Android phones
- AI cost management at scale (embedding + generation + chat per classroom)

**Estimated timeline with this tooling:** 5-7 months to full MVP in a real school. Not 2 months, not 18 months.

---

## Part 2: Project Foundation Setup

Before writing a single line of product code, set up the infrastructure that makes Claude Code agents productive.

### 2.1 Repository Structure

```
vaasenk/
├── apps/
│   ├── web/                    # Next.js 15 + TypeScript + Tailwind v4
│   ├── mobile/                 # Expo (React Native) + TypeScript
│   └── api/                    # Node.js backend (NestJS recommended)
├── packages/
│   ├── shared-types/           # TypeScript types shared across all apps
│   ├── ui/                     # Shared component primitives (tokens, base components)
│   ├── db/                     # Prisma schema + migrations + seed
│   └── ai/                     # AI service abstractions (RAG, generation, embeddings)
├── infrastructure/
│   ├── docker-compose.yml      # Local dev: Postgres, Redis, MinIO (S3-compatible)
│   └── scripts/                # DB seed, migration, dev setup
├── docs/
│   ├── PRD/                    # Your existing PRD documents
│   ├── architecture/           # Architecture decision records
│   └── api-spec/               # OpenAPI specs (generated)
├── .claude/
│   ├── agents/                 # Agency Agents installed here
│   ├── skills/                 # Custom Vaasenk-specific skills
│   └── CLAUDE.md               # THE critical file — see below
├── turbo.json                  # Turborepo config
├── package.json                # Root workspace
└── tsconfig.base.json          # Shared TS config
```

### 2.2 The CLAUDE.md File (Most Important File in Your Project)

This file is what turns Claude Code from a generic assistant into YOUR engineering team. Every agent session reads this. Make it perfect.

```markdown
# CLAUDE.md — Vaasenk Project Intelligence

## Product Context
Vaasenk is a classroom productivity platform for Indian schools, colleges,
and coaching centers. Core value: teachers photograph board notes, students
stop copying. Secondary value: AI-powered question paper generation and
syllabus-grounded teacher assistant.

Tagline: "Teach more. Copy less."
Target: Tamil Nadu schools (Samacheer Kalvi), CBSE schools, coaching centers.

## Architecture

### Monorepo (Turborepo)
- `apps/web` — Next.js 15, App Router, TypeScript, Tailwind v4, ShadCN/Radix
- `apps/mobile` — Expo SDK 52+, TypeScript, NativeWind (Tailwind for RN)
- `apps/api` — NestJS, TypeScript, Prisma ORM, PostgreSQL
- `packages/shared-types` — Zod schemas + inferred TS types, shared across all
- `packages/db` — Prisma schema, migrations, seed scripts
- `packages/ui` — Design tokens, base components used by web and mobile
- `packages/ai` — AI service layer (abstracts provider behind interface)

### Key Technical Decisions (DO NOT OVERRIDE)
- Auth: Supabase Auth (JWT + RLS). Do NOT build custom auth.
- Database: Supabase PostgreSQL with pgvector extension enabled.
- File Storage: Supabase Storage with signed URLs. Never expose raw paths.
- Background Jobs: BullMQ with Redis for async processing.
- AI Orchestration: Direct LangChain.js calls from NestJS. NOT Flowise/Langflow.
- ORM: Prisma with strict institution_id scoping on every query.
- Deployment: Vercel (web), EAS (mobile), Railway (API + Redis + workers).

### Multi-Tenancy Rules (CRITICAL — enforce on every query)
- Every database table with user data MUST have `institution_id` column
- Every Prisma query MUST include `where: { institutionId }` filter
- Every API endpoint MUST extract institutionId from JWT and inject into service
- File storage paths: `/{institution_id}/{classroom_id}/{file_id}`
- Vector store namespaces: `inst_{id}_class_{id}_syllabus_{id}`
- NEVER trust client-sent institutionId — always derive from auth token

### Role Hierarchy
- SuperAdmin: Platform-level (Vaasenk team only)
- Admin: Institution-level (school principal/coordinator)
- Teacher: Classroom-level (assigned classrooms only)
- Student: Classroom-level (enrolled classrooms only)

### Design System
- Brand colors: #A00000 (Vaasenk Red), #FECA02 (Learning Gold)
- Background: #FFF7EA (Cream Canvas), not white
- Design tokens are in `packages/ui/tokens/` — always import, never hardcode
- Glassmorphism: rgba(255,255,255,0.72) + backdrop-blur(20px) for cards
- Radius: 24px cards, 999px buttons/pills, 44px hero panels
- Font: Inter (web), system default (mobile)
- Gradients: Brand Flame for CTAs, Deep AI Glow for AI panels, Cream Sunrise for backgrounds
- Mobile: 44px minimum touch targets, bottom nav max 5 items

### Code Standards
- All API responses use consistent envelope: `{ data, error, meta }`
- Use Zod for all input validation (shared between frontend and backend)
- File uploads: validate MIME type server-side, max 25MB, compress images
- Error handling: NestJS exception filters, typed error codes
- Every component needs: default, loading, empty, error, disabled states
- Tests: Vitest for unit, Playwright for e2e on web, Detox for mobile
- Git: conventional commits, PR per feature, no direct main pushes

### AI Pipeline Rules
- All AI calls go through `packages/ai` service layer
- Every AI request MUST include: institutionId, classroomId, syllabusId, userId
- RAG retrieval MUST filter by institution + classroom metadata
- AI responses MUST include source references when available
- Show disclaimer: "AI can make mistakes. Verify important information."
- Track token usage per institution for cost management
- Use streaming for chat responses, polling for paper generation jobs

### API Naming Conventions
- REST endpoints: `/api/v1/{resource}`
- Nested resources: `/api/v1/classrooms/:id/notes`
- Actions: `/api/v1/question-papers/:id/generate` (POST)
- All list endpoints support: `?page=&limit=&sort=&filter=`

### File Organization Within Each App
apps/web:
  src/app/            — Next.js App Router pages
  src/components/     — Page-specific components
  src/components/ui/  — ShadCN primitives
  src/lib/            — Utilities, API client, auth helpers
  src/hooks/          — Custom React hooks

apps/api:
  src/modules/{name}/ — NestJS module (controller, service, dto, entity)
  src/common/         — Guards, interceptors, filters, decorators
  src/config/         — Environment config

apps/mobile:
  src/screens/        — Screen components
  src/components/     — Reusable mobile components
  src/navigation/     — React Navigation config
  src/hooks/          — Mobile-specific hooks
  src/services/       — API client, storage, push
```

### 2.3 Custom Vaasenk Skills for Claude Code

Create these in `.claude/skills/` to give Claude Code Vaasenk-specific capabilities:

**`.claude/skills/vaasenk-component/SKILL.md`**
```markdown
---
name: vaasenk-component
description: Create Vaasenk UI components following the design system
---

When creating any Vaasenk component:
1. Import tokens from `@vaasenk/ui/tokens`
2. Use the Vaasenk color palette — never hardcode colors
3. Every component needs these states: default, loading, empty, error, disabled
4. Cards use `rounded-[24px]` with `shadow-soft` on cream backgrounds
5. Primary buttons use Brand Flame gradient with white text and `rounded-full`
6. Touch targets minimum 44px on mobile
7. Use `Inter` font via CSS variable, never import directly
8. Glassmorphism cards: `bg-white/72 backdrop-blur-[20px] border border-line-sand`
9. Role-based visibility: check user role before rendering admin/teacher actions
10. All text on gradients must be white or use dark overlay for contrast
```

**`.claude/skills/vaasenk-api/SKILL.md`**
```markdown
---
name: vaasenk-api
description: Create Vaasenk NestJS API modules following multi-tenant patterns
---

When creating any Vaasenk API module:
1. Every service method receives `institutionId` from the controller (extracted from JWT)
2. Every Prisma query includes `institutionId` in the WHERE clause
3. Use the `@CurrentUser()` decorator to get authenticated user
4. Use the `@Roles('admin', 'teacher')` decorator for RBAC
5. Input validation uses DTOs with class-validator decorators
6. Response format: `{ data: T, meta?: { page, total } }`
7. File operations use signed URLs from Supabase Storage — never raw paths
8. Async jobs dispatch to BullMQ with `institutionId` in job data
9. List endpoints always support pagination: `?page=1&limit=20`
10. Log sensitive actions to audit_logs table
```

---

## Part 3: Sprint Sequence with Agent Prompts

This is the exact order to build Vaasenk. Each sprint maps to specific Agency Agents and includes the prompts you'll use.

### SPRINT 0: Foundation (Week 1-2)
**Goal:** Monorepo, database, auth, deployment pipeline — zero product UI.

**You do manually:**
- Create Turborepo monorepo with the structure above
- Set up Supabase project (DB + Auth + Storage)
- Set up Railway project (API hosting)
- Set up Vercel project (web hosting)
- Configure environment variables

**Agent prompts:**

```
PROMPT 1 — Backend Architect Agent:
"Activate Backend Architect. I'm building Vaasenk, an education SaaS.
Read CLAUDE.md for full context. Create the NestJS app scaffold in
apps/api/ with:
- NestJS project with TypeScript strict mode
- Prisma integration with the connection string from env
- JWT auth guard that extracts user from Supabase JWT
- CurrentUser decorator that provides { id, role, institutionId }
- Roles guard with @Roles() decorator
- Global exception filter with typed error responses
- Health check endpoint
- CORS configured for localhost:3000 and the Vercel domain
- Environment config module with validation
Do NOT create any product modules yet. Foundation only."
```

```
PROMPT 2 — Backend Architect Agent:
"Now create the complete Prisma schema in packages/db/prisma/schema.prisma.
Read CLAUDE.md for the data model. Implement these tables:
institutions, users, teachers, students, academic_years, classes, sections,
subjects, syllabus_documents, sample_question_papers, classrooms,
classroom_members, notes, bookmarks, question_paper_jobs, ai_chatbots,
ai_chat_sessions, ai_chat_messages, notifications, audit_logs.

Rules:
- Every table with user data has institutionId (relation to institutions)
- Use UUID for all IDs
- Use enum for roles: SUPER_ADMIN, ADMIN, TEACHER, STUDENT
- Use enum for status fields: ACTIVE, INACTIVE, ARCHIVED, PROCESSING, FAILED
- Add createdAt/updatedAt on every table
- Add proper indexes for common queries
- Add cascade delete rules appropriately
- The schema must pass prisma validate"
```

```
PROMPT 3 — DevOps Agent:
"Activate DevOps Engineer. Create docker-compose.yml in infrastructure/
for local development with:
- PostgreSQL 16 with pgvector extension
- Redis 7 for BullMQ
- MinIO for S3-compatible local file storage
Include a setup script that runs migrations, creates buckets, and seeds
a test institution with admin/teacher/student users.
Also create a .env.example with all required variables documented."
```

```
PROMPT 4 — Frontend Developer Agent:
"Activate Frontend Developer. Set up apps/web/ as a Next.js 15 project
with App Router. Configure:
- TypeScript strict
- Tailwind v4 with Vaasenk theme tokens imported from packages/ui
- ShadCN UI initialized with the Vaasenk color palette
- Supabase client for auth
- App layout with auth check (redirect to /login if unauthenticated)
- Role-based layout routing: /admin/*, /teacher/*, /student/*
- API client utility using fetch with auth headers
- Loading and error boundary components using Vaasenk design
Do NOT create any product pages yet. Shell only."
```

### SPRINT 1: Core Auth + Institution Setup (Week 3-4)
**Goal:** Admin can log in, set up institution, create academic structure.

**Agent prompts:**

```
PROMPT 5 — Backend Architect:
"Create the auth module in apps/api/src/modules/auth/.
- POST /auth/login — validate with Supabase, return user with role
- POST /auth/register — create user in Supabase + our DB
- POST /auth/invite/accept — accept invite token, create account
- GET /auth/me — return current user profile
- Middleware: extract Supabase JWT, look up user in our DB, attach to request
All endpoints follow CLAUDE.md response format."
```

```
PROMPT 6 — Backend Architect:
"Create the institution module in apps/api/src/modules/institutions/.
- POST /institutions — SuperAdmin creates institution
- GET /institutions/:id — get institution details (admin only)
- PUT /institutions/:id — update institution profile
- POST /institutions/:id/setup — step-based setup:
  creates academic_year, classes, sections, subjects in one transaction
- GET /institutions/:id/setup-status — returns checklist completion

All queries scoped by institutionId. Include DTOs with validation."
```

```
PROMPT 7 — Frontend Developer + UI Designer:
"Build the admin institution setup wizard at apps/web/src/app/admin/setup/.
This is a multi-step wizard with these steps:
1. Institution Details (name, type, board, address, contact)
2. Academic Year (name, start, end)
3. Classes and Sections (add/remove rows dynamically)
4. Subjects (list with add/remove)
5. Confirmation with summary

Use Vaasenk design: Cream Sunrise background, glass cards, Brand Flame
primary button, Admin Royal gradient for the header. Progress stepper
at top. Each step validates before proceeding.

Read the CLAUDE.md design system section. Use ShadCN components styled
with Vaasenk tokens. The wizard saves progress to backend on each step."
```

```
PROMPT 8 — Backend Architect:
"Create the users management module at apps/api/src/modules/users/.
- POST /users/teachers — admin invites teacher (creates user + sends invite)
- POST /users/students — admin creates student
- POST /users/students/import — bulk CSV import with row-level validation
- GET /users?role=teacher — list with pagination and search
- PATCH /users/:id/status — activate/deactivate
- DELETE /users/:id — soft delete

Include CSV parsing logic. Return row errors as array. Scope by institution."
```

```
PROMPT 9 — Frontend Developer:
"Build the teacher management page at /admin/teachers.
- Table view with search, status filter
- Invite teacher drawer/modal
- CSV import with drag-drop and error display
- Activate/deactivate toggle per row
Use Vaasenk design: cream flat table, filter chips, soft shadow cards.
Connect to the users API endpoints."
```

### SPRINT 2: Classroom + Notes Core (Week 5-7)
**Goal:** The core product loop: teacher uploads → student sees notes.

```
PROMPT 10 — Backend Architect:
"Create the classrooms module at apps/api/src/modules/classrooms/.
- POST /classrooms — create with class, section, subject, teacher, syllabus mapping
- GET /classrooms — list (role-filtered: admin sees all, teacher sees assigned, student sees enrolled)
- GET /classrooms/:id — detail with member counts and AI status
- POST /classrooms/:id/join — student joins with invite code
- POST /classrooms/:id/refresh-code — admin/teacher regenerates code
- GET /classrooms/:id/members — list enrolled users

Generate unique 6-char invite code. Include classroom_members creation.
Validate teacher assignment. Scope by institution."
```

```
PROMPT 11 — Backend Architect:
"Create the notes module at apps/api/src/modules/notes/.
- POST /classrooms/:id/notes — teacher uploads note (multipart: file + metadata)
- GET /classrooms/:id/notes — paginated list with tag filter
- GET /notes/:id — note detail with signed file URL
- PATCH /notes/:id — update title/tags/description
- DELETE /notes/:id — soft delete (teacher own + admin any)
- POST /notes/:id/bookmark — toggle bookmark
- GET /bookmarks — student's bookmarked notes

File upload flow:
1. Validate file type (image/pdf/text) and size (<25MB)
2. Compress images if >5MB
3. Upload to Supabase Storage at /{institutionId}/{classroomId}/{noteId}/
4. Generate thumbnail for images (sharp library)
5. Create notification for enrolled students
6. Queue OCR job for Phase 2 (just create the job, don't implement OCR yet)

Return signed URLs with 1-hour expiry."
```

```
PROMPT 12 — Frontend Developer + UI Designer:
"Build the teacher classroom detail page at /teacher/classrooms/[id].
Layout: top header with classroom identity (subject, class, section, student count),
segmented tabs: Notes | Papers | AI Assistant | Students | Settings.

For the Notes tab:
- Note cards in a grid/list with thumbnail, title, teacher, date, tag badge
- Upload button opens upload drawer
- Upload form: drag-drop file, title, description, tag selector (Important,
  Homework, Revision, Formula, Assignment, Exam), publish/draft toggle
- Upload progress indicator
- Success toast after publish

Vaasenk design: Teacher Orange gradient header, glass cards for notes,
tag badges with appropriate colors, quick upload FAB on mobile viewport."
```

```
PROMPT 13 — Frontend Developer:
"Build the student home dashboard at /student/dashboard.
Sections:
1. Greeting header: 'Good morning, {name}' with Cream Sunrise gradient
2. Quick actions: Join Classroom, Bookmarks, Downloads
3. Recent Notes: cards from all enrolled classrooms, sorted by date
4. My Classrooms: horizontal scroll cards with subject, teacher, note count

Empty state for no classrooms: illustration placeholder + 'Join your
first classroom' CTA. Connect to /students/home API."
```

```
PROMPT 14 — Frontend Developer:
"Build the student classroom feed at /student/classrooms/[id].
- Classroom header with subject, teacher, class info
- Notes feed: card list with thumbnail, title, date, tags
- Filter chips: All, Important, Homework, Exam, Revision
- Each card has bookmark toggle and download button
- Tap opens note detail with image/PDF viewer
- Note detail: full-screen viewer, pinch zoom for images, PDF scroll,
  bottom action bar with bookmark + download

Use Vaasenk Student Coral gradient for classroom header."
```

### SPRINT 3: Admin Syllabus + Sample Papers (Week 8-9)
**Goal:** Admin uploads syllabus and sample papers. AI pipeline foundations.

```
PROMPT 15 — Backend Architect:
"Create the syllabus module at apps/api/src/modules/syllabus/.
- POST /syllabus — upload PDF with metadata (board, class, subject, year, version)
- GET /syllabus — library list with status filters
- PATCH /syllabus/:id — update metadata, replace file (creates new version)
- POST /syllabus/:id/map — map syllabus to classroom(s)
- GET /syllabus/:id/classrooms — which classrooms use this syllabus
- POST /syllabus/:id/reprocess — re-trigger AI processing

Status lifecycle: UPLOADED → PROCESSING → AI_READY | FAILED

On upload, dispatch BullMQ job 'syllabus.process' with:
{syllabusId, institutionId, fileUrl}

Create the BullMQ worker scaffold in apps/api/src/workers/syllabus.worker.ts.
For now, the worker should:
1. Download PDF from storage
2. Extract text using pdf-parse library
3. Chunk text into ~500 token segments with overlap
4. Store chunks in a syllabus_chunks table with metadata
5. Update syllabus status to AI_READY or FAILED
6. Skip embedding generation for now (next sprint)

Create the sample-papers module similarly with exam_type, year, term metadata."
```

```
PROMPT 16 — Frontend Developer:
"Build the admin syllabus library at /admin/syllabus.
- Grid/list view of uploaded syllabi
- Each card shows: board, class, subject, version, status badge
  (Uploaded=gray, Processing=amber, AI Ready=green, Failed=red)
- Upload form: file dropzone + metadata form (board, class, subject, year, language)
- Status shows which classrooms are mapped
- Reprocess button for failed items
- Replace version action

Admin Royal gradient for page header, cream glass cards, processing
timeline visualization for status."
```

### SPRINT 4: AI Pipeline — Embeddings + RAG Chat (Week 10-13)
**Goal:** Teacher AI chatbot works. This is the hardest sprint.

```
PROMPT 17 — Backend Architect (AI-focused):
"Create the AI service layer in packages/ai/.

Architecture:
- packages/ai/src/embeddings.ts — generate embeddings using OpenAI text-embedding-3-small
- packages/ai/src/vectorStore.ts — pgvector operations (store, search, delete by namespace)
- packages/ai/src/rag.ts — retrieval-augmented generation pipeline
- packages/ai/src/chat.ts — chat completion with streaming support
- packages/ai/src/prompts/ — prompt templates as separate files

Embedding flow:
1. Take syllabus_chunks from DB
2. Generate embeddings via OpenAI API
3. Store in a vector_embeddings table using pgvector (1536 dimensions)
4. Namespace: 'inst_{institutionId}_syl_{syllabusId}'

RAG retrieval:
1. Embed user query
2. Search vector_embeddings filtered by namespace + metadata
3. Return top 5 chunks with similarity score
4. Include chunk metadata (chapter, page, source document)

Chat completion:
1. Build system prompt with Vaasenk teacher assistant personality
2. Inject retrieved chunks as context
3. Stream response via SSE
4. Extract and return source citations

Update the syllabus worker to call embeddings after chunking.

Every function takes institutionId as mandatory parameter.
Never mix namespaces across institutions."
```

```
PROMPT 18 — Backend Architect:
"Create the AI chatbot module at apps/api/src/modules/ai-chat/.
- POST /classrooms/:id/ai/chat — send message (SSE streaming response)
- GET /classrooms/:id/ai/sessions — list chat sessions
- GET /classrooms/:id/ai/sessions/:sessionId — get session messages
- POST /classrooms/:id/ai/sessions — create new session

Flow:
1. Verify teacher is assigned to classroom
2. Verify classroom has AI_READY syllabus
3. Get or create chat session
4. Call RAG pipeline with query + classroom's syllabus namespace
5. Stream response with source citations
6. Save message pair to ai_chat_messages
7. Track token usage in ai_usage_logs table

System prompt for teacher assistant:
'You are Vaasenk AI, a teaching assistant for {subject} in {class}.
You answer using ONLY the mapped syllabus and sample papers.
Always cite chapter/topic when referencing syllabus content.
If asked something outside the syllabus, say: I could not find this
in the mapped syllabus. Please verify from other sources.
Never fabricate page numbers or references.'

Guard: teacher-only in MVP. Return 403 for students."
```

```
PROMPT 19 — Frontend Developer + UI Designer:
"Build the teacher AI assistant panel at /teacher/classrooms/[id]/ai.
This is inside the classroom detail page as a tab.

Layout:
- Chat interface with messages (user right, AI left)
- AI messages show source citation chips below response
- Quick prompt chips above input: Summary, Important Questions,
  Lesson Plan, Quiz, Explain Simply
- Input with send button, streaming response with typing indicator
- Session history sidebar/drawer
- Status banner at top: shows syllabus status, if not ready show
  'Syllabus is still being prepared for AI'

Vaasenk design: Deep AI Glow gradient for AI panel header,
glass card for chat area, source chips with gold accent.
Include disclaimer: 'AI can make mistakes. Verify important information.'

Use SSE/EventSource for streaming. Show loading steps:
'Reading syllabus → Finding relevant content → Generating response'"
```

### SPRINT 5: Question Paper Generator (Week 14-16)
**Goal:** Teachers can generate exam papers from syllabus + sample papers.

```
PROMPT 20 — Backend Architect:
"Create the question paper generator module at apps/api/src/modules/question-papers/.

- POST /classrooms/:id/question-papers/generate — create generation job
- GET /question-papers/jobs/:id — get job status + result
- PATCH /question-papers/:id — edit generated paper
- POST /question-papers/:id/export — generate PDF
- POST /question-papers/:id/publish — publish to classroom

Generation job input (DTO):
{
  classroomId, syllabusId,
  portions: string[] (chapter names or topic list),
  examType: enum (UNIT_TEST, MONTHLY, QUARTERLY, HALF_YEARLY, ANNUAL, CUSTOM),
  totalMarks: number,
  duration?: string,
  questionTypes: { type: string, count: number, marksEach: number }[],
  difficulty?: { easy: number, medium: number, hard: number },
  samplePaperIds?: string[] (optional guidance),
  includeAnswerKey: boolean
}

Generation flow (BullMQ job):
1. Retrieve syllabus chunks for selected portions (filtered by chapter/topic)
2. If sample papers selected, retrieve their indexed patterns
3. Build structured prompt with:
   - Syllabus content for selected portions
   - Question type/marks/difficulty requirements
   - Sample paper patterns if available
   - Exam formatting instructions
4. Call LLM to generate structured JSON output:
   { title, instructions, sections: [{ name, questions: [{ text, marks, type, answer? }] }] }
5. Validate marks total matches requested
6. Save to question_papers table with status GENERATED
7. Update job status

PDF export: use a template to render the question paper as downloadable PDF."
```

```
PROMPT 21 — Frontend Developer:
"Build the question paper generator wizard at /teacher/classrooms/[id]/generate.

Steps:
1. Portion Selection — show syllabus chapters/topics as checkboxes
   (derived from syllabus_chunks metadata)
2. Exam Configuration — exam type dropdown, total marks, duration,
   question type builder (add rows: type + count + marks each),
   difficulty sliders, answer key toggle
3. Sample Paper Guidance — optional: select from available sample papers
   or choose 'No guidance'
4. Generate — show progress: 'Preparing syllabus context → Analyzing patterns
   → Drafting questions → Formatting paper'
5. Preview & Edit — rendered paper with editable sections/questions,
   regenerate individual questions, marks validation
6. Export — Download PDF, Save to classroom, Share

Vaasenk design: Teacher Orange gradient for wizard header, step indicator,
glass cards for each form section. Preview uses clean exam paper styling.
Show source note: 'Generated using [syllabus name] + [sample papers used]'"
```

### SPRINT 6: Notifications + Polish (Week 17-18)
**Goal:** System feels alive. Users know when things happen.

```
PROMPT 22 — Backend Architect:
"Create the notifications module at apps/api/src/modules/notifications/.
- GET /notifications — paginated list for current user
- PATCH /notifications/:id/read — mark as read
- PATCH /notifications/read-all — mark all as read
- WebSocket gateway for real-time in-app notifications

Notification types enum:
NOTE_PUBLISHED, PAPER_GENERATED, PAPER_FAILED, CLASSROOM_JOINED,
DOUBT_RECEIVED, DOUBT_REPLIED, SYLLABUS_READY, SYLLABUS_FAILED,
AI_CREDITS_LOW, SYSTEM_ANNOUNCEMENT

Trigger notifications from:
- Note upload → notify enrolled students
- Question paper generated → notify teacher
- Student joins classroom → notify teacher
- Syllabus processing complete → notify admin
- AI processing failure → notify admin

Store: notifications table with userId, type, title, body, entityType,
entityId (for deep linking), readAt."
```

```
PROMPT 23 — Frontend Developer:
"Build the notification center component used across all roles.
- Bell icon in top bar with unread count badge
- Dropdown panel with grouped notifications (Today, Yesterday, This Week)
- Each notification: icon, title, body, time, unread dot
- Click navigates to relevant page (deep link by entityType + entityId)
- Mark all read button
- Empty state: 'You are all caught up'

Also integrate WebSocket connection in the app layout to receive
real-time notifications and update the bell count."
```

### SPRINT 7: Mobile App (Week 19-24)
**Goal:** Student + Teacher mobile experience.

```
PROMPT 24 — Mobile Developer Agent:
"Activate Mobile Developer. Set up apps/mobile/ as an Expo project.
- Expo SDK 52+ with TypeScript
- NativeWind (Tailwind for React Native) with Vaasenk tokens
- React Navigation with bottom tabs
- Supabase client for auth with SecureStore token storage
- API client matching web's API client
- Role-based navigation: StudentTabs and TeacherTabs

Student tabs: Home, Classrooms, Bookmarks, Downloads, Profile
Teacher tabs: Home, Classrooms, Upload (center FAB), AI, Profile

Auth flow: Splash → Welcome → Login → Role routing
Use Vaasenk design tokens from packages/ui for colors, spacing, radius."
```

```
PROMPT 25 — Mobile Developer:
"Build the student mobile experience:
1. StudentHome — greeting, recent notes, my classrooms cards
2. JoinClassroom — 6-char code input, classroom preview, confirm join
3. ClassroomFeed — notes list with filter chips, bookmark/download actions
4. NoteDetail — image viewer with pinch zoom, PDF viewer, action bar
5. Bookmarks — list of bookmarked notes
6. Downloads — list of downloaded files (local storage)

Use React Native's Image component for photos, react-native-pdf for PDFs.
Implement pull-to-refresh on feeds. Cache classroom list for fast loading."
```

```
PROMPT 26 — Mobile Developer:
"Build the teacher mobile experience:
1. TeacherHome — classrooms, recent uploads, pending doubts count, AI shortcut
2. QuickUpload — camera capture → preview → add title/tags → select classroom → publish
   Use expo-camera for capture, expo-image-manipulator for compression
3. ClassroomDetail — tabs: Notes, Doubts, Papers, AI
4. AIAssistant — chat interface matching web design, quick prompt chips
5. GeneratePaper — simplified form with presets, show job status, preview result

The camera upload MUST be fast: open → capture → preview → publish in <60 seconds.
This is the core teacher value proposition."
```

```
PROMPT 27 — Mobile Developer:
"Implement push notifications for mobile.
- Use expo-notifications for push token registration
- On login, register device token with backend
- Backend sends push via Expo Push API when creating notifications
- Notification tap deep-links to correct screen
- Badge count updates with unread count
- Configure notification channels for Android (Notes, AI, System)"
```

### SPRINT 8: Admin Dashboard + Billing (Week 25-26)
**Goal:** Admin can manage everything. Basic billing tracking.

```
PROMPT 28 — Frontend Developer:
"Build the admin dashboard at /admin/dashboard.
Sections:
1. Institution card with setup completion checklist
2. Stats: total teachers, students, classrooms, notes, AI generations
3. AI Processing Status: list of syllabus/sample paper processing states
4. Recent Activity: last 10 actions across institution
5. Subscription status card with plan, usage, renewal date

Admin Royal gradient hero, cream stat cards, status badges.
Use the admin sidebar navigation: Dashboard, Classes, Teachers, Students,
Syllabus, Sample Papers, Classrooms, Billing, Settings."
```

```
PROMPT 29 — Backend Architect:
"Create the subscription module at apps/api/src/modules/subscriptions/.
For MVP, this is manual billing tracking (no payment gateway).
- Institution has a plan: STARTER, GROWTH, INSTITUTION, TRIAL
- Track: user_limit, storage_limit_gb, ai_credits_monthly
- Track usage: current_users, storage_used_gb, ai_credits_used
- GET /institutions/:id/subscription — plan + usage
- PATCH /institutions/:id/subscription — admin/superadmin update plan
- Enforce limits in guards: check user count before invite,
  check AI credits before generation, check storage before upload
- Return 402 with clear message when limit hit"
```

---

## Part 4: Agent Workflow Protocol

For every coding session, follow this workflow:

### Session Start
```
1. Open Claude Code in the correct app directory (apps/web, apps/api, or apps/mobile)
2. Activate the relevant agent: "Activate [Agent Name]"
3. Provide context: "Read CLAUDE.md. We're working on Sprint [X], Feature [Y]."
4. Give the specific prompt from this playbook
5. Review the plan before approving code generation
```

### Agent Selection Guide

| Task | Primary Agent | Support Agent |
|------|--------------|---------------|
| Database schema, API endpoints, services | Backend Architect | — |
| React pages, components, layouts | Frontend Developer | UI Designer |
| Design system, tokens, visual polish | UI Designer | Whimsy Injector |
| Mobile screens, navigation | Mobile Developer (custom) | Frontend Developer |
| Authentication, guards, middleware | Security Engineer | Backend Architect |
| Docker, CI/CD, deployment | DevOps Engineer | — |
| AI pipeline, embeddings, RAG | Backend Architect | — |
| API testing, edge cases | Reality Checker | Evidence Collector |
| Performance, caching, optimization | Backend Architect | DevOps Engineer |
| PR review, code quality | Reality Checker | — |
| Product decisions, scope questions | Product Manager | — |

### Session Hygiene
```
- /compact after completing each feature (before starting the next)
- Never let a single session span two unrelated features
- After major refactors, start a fresh session so the agent reads clean state
- If Claude Code produces something that doesn't match CLAUDE.md, correct it
  immediately — don't let bad patterns propagate
```

### Quality Gates (Run After Every Feature)
```
"Activate Reality Checker. Review the code I just wrote for [feature].
Check:
1. Multi-tenant: is institutionId enforced in every query?
2. RBAC: are role guards on every endpoint?
3. States: does the UI handle loading, empty, error, disabled?
4. Types: are all inputs validated with Zod/class-validator?
5. Security: are file URLs signed? Are secrets exposed?
6. Design: does this match the Vaasenk design system in CLAUDE.md?"
```

---

## Part 5: Critical Success Patterns

### Pattern 1: Never Let Agents Make Architecture Decisions
You decide: which database, which auth provider, which AI model, which deployment platform. The agents execute within your decisions. Your CLAUDE.md encodes these decisions. If an agent suggests switching from Prisma to TypeORM, reject it.

### Pattern 2: One Agent, One Feature, One Session
Don't ask the Frontend Developer to also fix the API. Don't ask the Backend Architect to also style the button. Switch agents when you switch contexts. The persona focus is what makes them effective.

### Pattern 3: Design Token Enforcement
Your design tokens are already built. The biggest risk is agents generating components that ignore them and use hardcoded colors/spacing. Put this in your CLAUDE.md and reinforce it in every frontend prompt: "Import from @vaasenk/ui/tokens. Never hardcode colors."

### Pattern 4: Test the RAG Pipeline with Real Data Early
Don't wait until Sprint 4 to obtain actual Samacheer Kalvi PDFs. Get them now. The quality of your PDF extraction, chunking, and retrieval will determine whether the AI features are useful or garbage. Budget 2-3 weeks of pure iteration on RAG quality with real Tamil Nadu school content.

### Pattern 5: Ship to One School Before Building the Mobile App
After Sprint 6 (web complete + notifications), deploy and get ONE school using the web version. Their feedback will tell you what the mobile app actually needs, which may be different from your spec.

### Pattern 6: AI Cost Guard Rails from Day One
Track every OpenAI API call with institutionId, userId, and token count. Set hard limits. A single teacher discovering the chatbot can burn through $50/day in API costs if uncontrolled.

---

## Part 6: Technology Stack Cheat Sheet

| Layer | Choice | Why |
|-------|--------|-----|
| Monorepo | Turborepo | Fast builds, shared packages, works with Vercel |
| Web Framework | Next.js 15 (App Router) | SSR, API routes fallback, Vercel deployment |
| Mobile Framework | Expo (React Native) | OTA updates, EAS build, good for 2-person team |
| Backend | NestJS | Structured modules, guards, interceptors, TypeScript-native |
| ORM | Prisma | Type-safe, great migrations, works with Supabase PG |
| Database | Supabase PostgreSQL + pgvector | Managed, auth built-in, vector search, generous free tier |
| Auth | Supabase Auth | JWT, magic links, phone OTP, RLS, no custom build |
| File Storage | Supabase Storage | Signed URLs, image transforms, same dashboard |
| Cache/Queue | Redis + BullMQ | Background jobs for AI processing, notifications |
| AI Embeddings | OpenAI text-embedding-3-small | Best cost/quality ratio for education content |
| AI Chat/Generation | Claude Sonnet or GPT-4o-mini | Sonnet for quality, GPT-4o-mini for cost on high volume |
| PDF Processing | pdf-parse + sharp | Text extraction + image thumbnails |
| Deployment (Web) | Vercel | Zero-config Next.js, preview deployments |
| Deployment (API) | Railway | Easy Node.js, Redis, persistent storage |
| Deployment (Mobile) | EAS Build + EAS Update | OTA updates without app store review |
| Monitoring | Sentry | Error tracking across web, mobile, API |

---

## Part 7: What You Still Can't Shortcut

Even with the best tooling, these require your human judgment:

1. **Talking to real teachers in Tamil Nadu.** No agent replaces user research. Visit a school. Watch a teacher use a phone. See how students share notes on WhatsApp currently.

2. **RAG quality tuning.** The difference between "useful AI assistant" and "hallucinating garbage" is prompt engineering, chunk size, retrieval threshold, and re-ranking — all of which need iterative testing with real syllabus content.

3. **Pricing validation.** Your ₹2,999/month starter plan needs validation. Talk to 10 school administrators before committing.

4. **Legal/compliance.** Student data in India (even if no COPPA equivalent exists yet) needs thought. Who owns the uploaded content? What happens when a school cancels?

5. **The first 5 minutes of teacher onboarding.** If a teacher can't upload their first board photo in under 60 seconds, the product fails. No amount of AI features saves a bad upload flow.

---

*This playbook gives you the sequence, the prompts, and the guardrails. The agents give you the hands. Your job is the brain: architecture decisions, user empathy, quality bar, and knowing when to ship versus when to polish.*

*Start with Sprint 0. Get the foundation right. Everything else builds on it.*
