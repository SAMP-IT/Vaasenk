# Vaasenk — Claude Code Session Prompts
## How to Actually Build This Product

---

## ⚠️ READ THIS FIRST — The Rules

**Claude Code CANNOT build your entire product in one session.**

Here's how this actually works:

1. **One session = one task.** Each prompt below is ONE Claude Code session.
2. **After each session:** Review the code, test it, commit it.
3. **Start fresh:** Run `/clear` or `/compact` between major tasks.
4. **Sprint order matters.** Don't skip ahead. Each sprint depends on the previous.
5. **You are the architect.** Claude Code is the builder. You review every output.

### Your Folder Setup
Place CLAUDE.md at your project root:
```
S:/SAMP IT/Vaasenk/
├── CLAUDE.md                    ← THE BRAIN (copy from output)
├── design-docs/                 ← Your existing design tokens + UI/UX doc
├── docs/                        ← Your PRDs + Playbook
├── apps/                        ← Will be created by Sprint 0
├── packages/                    ← Will be created by Sprint 0
└── infrastructure/              ← Will be created by Sprint 0
```

---

## SPRINT 0 — Project Foundation

### Session 0.1: Monorepo Scaffold
Open Claude Code in `S:/SAMP IT/Vaasenk/` and paste:

```
Read CLAUDE.md completely before doing anything.

You are bootstrapping the Vaasenk project from scratch. This folder already
contains docs/ and design-docs/ with all product and design specifications.
Do NOT modify those folders.

Create the Turborepo monorepo with this exact structure:

1. Initialize root package.json with workspaces: ["apps/*", "packages/*"]
2. Add turbo.json with pipeline for build, dev, lint, typecheck
3. Add tsconfig.base.json with strict TypeScript config
4. Add .gitignore (node_modules, .env, dist, .next, .expo, .turbo)
5. Add .env.example with placeholder variables (see below)

Create these empty packages with package.json and tsconfig.json:
- packages/shared-types/    — for Zod schemas
- packages/ui/              — for design tokens
- packages/db/              — for Prisma schema
- packages/ai/              — for AI service layer

Copy the design tokens into packages/ui/:
- Copy design-docs/vaasenk.tokens.json → packages/ui/tokens/vaasenk.tokens.json
- Copy design-docs/vaasenk.design-tokens.ts → packages/ui/tokens/design-tokens.ts
- Copy design-docs/vaasenk.theme.css → packages/ui/tokens/theme.css
- Copy design-docs/vaasenk.tailwind.theme.css → packages/ui/tokens/tailwind.theme.css
- Copy design-docs/vaasenk.native-theme.ts → packages/ui/tokens/native-theme.ts
- Create packages/ui/tokens/index.ts that re-exports everything

Create infrastructure/ folder with an empty docker-compose.yml placeholder.

.env.example should contain:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vaasenk
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/vaasenk
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
REDIS_URL=redis://localhost:6379
OPENAI_API_KEY=sk-your-key
ANTHROPIC_API_KEY=sk-ant-your-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_API_URL=http://localhost:4000

Do NOT create any app code yet. Structure only.
Run: npm install (or pnpm install) at root after setup.
Verify: turbo build should pass (empty packages are fine).
```

### Session 0.2: Database Schema
After reviewing 0.1, run `/clear`, then paste:

```
Read CLAUDE.md — focus on section 3 (Multi-Tenancy Rules).
Then read docs/Vaasenk_Web_App_PRD_v0.1.pdf section 7 (Data Model Overview)
for the complete entity list.

Create the Prisma schema at packages/db/prisma/schema.prisma.

Initialize Prisma in packages/db/:
- npm init in packages/db if not done
- Install prisma and @prisma/client
- Create prisma/schema.prisma

The schema must include ALL these tables from the PRD:
institutions, users, teachers, students, academic_years, classes, sections,
subjects, syllabus_documents, syllabus_chunks, sample_question_papers,
classrooms, classroom_members, notes, bookmarks, question_paper_jobs,
question_papers, ai_chatbots, ai_chat_sessions, ai_chat_messages,
ai_usage_logs, vector_embeddings, notifications, audit_logs, subscriptions

Rules (MANDATORY — from CLAUDE.md):
- Use PostgreSQL provider with pgvector extension
- Use UUID for all primary keys (@default(uuid()))
- Every table with user data has institutionId field with relation to institutions
- Use enums for: UserRole (SUPER_ADMIN, ADMIN, TEACHER, STUDENT),
  Status (ACTIVE, INACTIVE, ARCHIVED), ProcessingStatus (UPLOADED, PROCESSING,
  AI_READY, FAILED), ExamType, NoteTag, NotificationType, SubscriptionPlan
- Add createdAt DateTime @default(now()) and updatedAt DateTime @updatedAt on every model
- Add proper @@index for: institutionId on every table, classroomId on notes,
  userId on bookmarks/notifications, syllabusId on syllabus_chunks
- Cascade rules: delete institution → cascade all children,
  delete classroom → cascade notes/members, soft-delete for users
- The vector_embeddings table needs: id, institutionId, syllabusId,
  chunkId, embedding (Unsupported("vector(1536)")), metadata Json, namespace String

Run: npx prisma validate
Run: npx prisma format

Do NOT run migrations yet (no DB connected). Schema correctness only.
```

### Session 0.3: NestJS Backend Scaffold
After reviewing 0.2, run `/clear`, then paste:

```
Read CLAUDE.md — sections 2, 5, 7.

Create the NestJS backend application in apps/api/:

1. Initialize NestJS project with TypeScript strict mode
2. Install dependencies: @nestjs/config, @nestjs/passport, @nestjs/jwt,
   @prisma/client, class-validator, class-transformer, @nestjs/bull,
   bullmq, ioredis, @supabase/supabase-js, helmet, compression

3. Create these foundational pieces:
   - src/config/env.config.ts — validate all env vars with class-validator
   - src/prisma/prisma.service.ts — Prisma client as NestJS injectable service
   - src/prisma/prisma.module.ts — global Prisma module
   - src/common/decorators/current-user.decorator.ts — @CurrentUser() param decorator
   - src/common/decorators/roles.decorator.ts — @Roles('admin','teacher') decorator
   - src/common/guards/jwt-auth.guard.ts — extract Supabase JWT, verify, look up user in DB
   - src/common/guards/roles.guard.ts — check user role against @Roles() metadata
   - src/common/filters/http-exception.filter.ts — standard error response format from CLAUDE.md
   - src/common/interceptors/response.interceptor.ts — wrap successful responses in { data } envelope
   - src/common/interceptors/institution-scope.interceptor.ts — auto-inject institutionId into request
   - src/modules/health/health.controller.ts — GET /health returns { status: 'ok' }

4. Configure app.module.ts:
   - ConfigModule (global, validate env)
   - PrismaModule (global)
   - BullModule.forRoot (Redis connection)
   - Apply JWT guard globally
   - Apply response interceptor globally
   - Enable CORS for localhost:3000 and Vercel domains
   - Enable helmet and compression

5. Create src/main.ts:
   - Listen on port 4000
   - Enable validation pipe globally
   - Swagger setup (basic, can enhance later)

Add scripts to apps/api/package.json: dev, build, start, lint

Do NOT create any product modules (auth, classrooms, notes, etc.) yet.
Test: npm run build should compile. npm run dev should start on port 4000.
GET /health should return { data: { status: 'ok' } }
```

### Session 0.4: Next.js Web Scaffold
After reviewing 0.3, run `/clear`, then paste:

```
Read CLAUDE.md — sections 2, 4, 5.
Read design-docs/README.md for the design direction.

Create the Next.js 15 web application in apps/web/:

1. Initialize Next.js 15 with App Router, TypeScript, Tailwind v4, src/ directory
2. Install: @supabase/ssr, @supabase/supabase-js, @radix-ui/react-*, lucide-react
3. Initialize ShadCN UI with these Vaasenk overrides:
   - Primary color: #A00000
   - Background: #FFF7EA (Cream Canvas)
   - Font: Inter

4. Import Vaasenk Tailwind theme:
   - In global CSS, import the Tailwind theme from packages/ui/tokens/tailwind.theme.css
   - Import the base theme CSS from packages/ui/tokens/theme.css
   - Ensure all Vaasenk CSS variables are available

5. Create app layout structure:
   src/app/
     layout.tsx              — Root layout with Inter font, Supabase provider
     (auth)/
       login/page.tsx        — Placeholder login page
       register/page.tsx     — Placeholder
       layout.tsx            — Auth layout (no sidebar, centered card)
     (dashboard)/
       layout.tsx            — Dashboard layout WITH sidebar/topbar
       admin/
         layout.tsx          — Admin sub-layout
         page.tsx            — Placeholder: "Admin Dashboard"
       teacher/
         layout.tsx          — Teacher sub-layout
         page.tsx            — Placeholder: "Teacher Dashboard"
       student/
         layout.tsx          — Student sub-layout
         page.tsx            — Placeholder: "Student Dashboard"

6. Create foundational utilities:
   src/lib/supabase/client.ts  — Browser Supabase client
   src/lib/supabase/server.ts  — Server-side Supabase client
   src/lib/supabase/middleware.ts — Auth middleware for session refresh
   src/lib/api-client.ts       — Fetch wrapper that adds auth token header
   src/middleware.ts            — Next.js middleware: redirect unauthed users to /login,
                                  redirect authed users to role-appropriate dashboard

7. Create base UI components using Vaasenk design:
   src/components/ui/vaasenk-button.tsx — Primary button with Brand Flame gradient
   src/components/ui/glass-card.tsx     — Glassmorphism card component
   src/components/ui/page-shell.tsx     — Page wrapper with Cream Sunrise background
   src/components/ui/loading-skeleton.tsx — Shimmer skeleton following Vaasenk style
   src/components/ui/empty-state.tsx    — Friendly empty state with illustration placeholder

Apply Vaasenk design rules from CLAUDE.md section 4:
- Cream Canvas background on all pages
- Glass cards for content panels
- Brand Flame gradient for primary buttons
- 24px card radius, 999px button radius
- Soft shadows: 0 8px 24px rgba(160,0,0,0.08)

Test: npm run dev should show pages at localhost:3000
All placeholder pages should render with Vaasenk cream background and proper fonts.
```

### Session 0.5: Docker + Local Dev Environment
After reviewing 0.4, run `/clear`, then paste:

```
Read CLAUDE.md section 2.

Create the local development infrastructure in infrastructure/:

1. docker-compose.yml with:
   - PostgreSQL 16 with pgvector extension (port 5432)
     Image: pgvector/pgvector:pg16
     DB name: vaasenk, user: postgres, pass: postgres
   - Redis 7 (port 6379)
   - MinIO for local S3-compatible storage (port 9000, console 9001)
     Access key: minioadmin, Secret: minioadmin
     Create default bucket: vaasenk-storage

2. Create infrastructure/scripts/setup.sh:
   - Start docker-compose
   - Wait for Postgres to be ready
   - Run Prisma migrations: cd packages/db && npx prisma migrate dev
   - Run seed script
   - Create MinIO bucket if not exists

3. Create packages/db/prisma/seed.ts:
   - Create a test institution: "Demo School"
   - Create admin user: admin@demo.school / role: ADMIN
   - Create teacher user: teacher@demo.school / role: TEACHER
   - Create student user: student@demo.school / role: STUDENT
   - Create one academic year, two classes (10-A, 10-B), three subjects (Maths, Science, English)
   - Create one classroom: 10-A Maths with the teacher assigned
   - Print created user IDs for testing

4. Add to root package.json scripts:
   "infra:up": "docker-compose -f infrastructure/docker-compose.yml up -d"
   "infra:down": "docker-compose -f infrastructure/docker-compose.yml down"
   "db:migrate": "cd packages/db && npx prisma migrate dev"
   "db:seed": "cd packages/db && npx prisma db seed"
   "db:studio": "cd packages/db && npx prisma studio"
   "dev": "turbo dev"

Configure Prisma seed in packages/db/package.json.

Test: docker-compose up -d should start all services.
Test: npm run db:migrate should create tables.
Test: npm run db:seed should populate test data.
Test: npm run dev should start both web and api concurrently.
```

---

## SPRINT 1 — Auth + Institution Setup

### Session 1.1: Auth Module (Backend)
```
Read CLAUDE.md. We are now on Sprint 1.

Create the auth module at apps/api/src/modules/auth/.
Files: auth.module.ts, auth.controller.ts, auth.service.ts, auth.dto.ts

Endpoints:
- POST /api/v1/auth/login — receives { email, password }, validates with
  Supabase Auth, looks up user in our DB, returns { user, accessToken, refreshToken }
- POST /api/v1/auth/register — receives { email, password, name, role, institutionId? },
  creates in Supabase Auth + our users table
- POST /api/v1/auth/invite/accept — receives { token, password, name },
  finds invite, creates account, links to institution
- GET /api/v1/auth/me — returns current authenticated user with role and institution
- POST /api/v1/auth/logout — invalidates session
- POST /api/v1/auth/forgot-password — triggers Supabase password reset email

The JWT auth guard (already created in 0.3) should:
1. Extract Bearer token from Authorization header
2. Verify with Supabase
3. Look up user in our Prisma users table
4. Attach full user object (id, role, institutionId, name, email) to request

DTOs: Use class-validator. Validate email format, password min length 8,
role must be valid enum value.

Response format per CLAUDE.md: { data: { user, tokens } } or { error: { code, message } }
```

### Session 1.2: Auth Pages (Frontend)
```
Read CLAUDE.md sections 4 and 5.
Read design-docs/Vaasenk_UI_UX_Design_Document section for Login and
Role Selection screens.

Build the auth screens in apps/web/src/app/(auth)/:

1. /login — Login page
   - Centered glass card on Cream Sunrise background
   - Vaasenk logo at top (use text "Vaasenk" styled with Brand Flame for now)
   - Email/phone input, password input with visibility toggle
   - "Sign in" primary button (Brand Flame gradient, full width, rounded-full)
   - "Forgot password?" link
   - "Don't have an account? Contact your admin" note
   - States: default, loading (button shows spinner), error (red message below input)
   - On success: redirect based on role → /admin, /teacher, or /student

2. /register — only accessible with invite token
   - Pre-filled institution and role from invite
   - Name, email (pre-filled from invite), password, confirm password
   - "Create account" primary button

3. Update middleware.ts:
   - Unauthenticated → redirect to /login
   - Authenticated → redirect to role-appropriate dashboard
   - /login when already authed → redirect to dashboard

Connect to the auth API endpoints from session 1.1.
Use the Supabase client for token management.
```

### Session 1.3-1.6 — Continue from Playbook
```
For the remaining Sprint 1 sessions (institution setup wizard, teacher management,
student management), follow the prompts in docs/Vaasenk_Development_Playbook.md
under "SPRINT 1: Core Auth + Institution Setup (Week 3-4)" — Prompts 5 through 9.

Each prompt = one Claude Code session.
/clear between sessions.
```

---

## SPRINTS 2-8 — Follow the Playbook

From Sprint 2 onwards, every prompt you need is already written in
`docs/Vaasenk_Development_Playbook.md` (Prompts 10 through 29).

### Session Workflow for Every Sprint:

```
STEP 1: Update CLAUDE.md
        Change "Current Sprint" and "Current Focus" in section 8

STEP 2: Open Claude Code in the correct app directory
        Backend work → cd apps/api
        Frontend work → cd apps/web
        Mobile work → cd apps/mobile
        Shared packages → cd to root

STEP 3: Start session with:
        "Read CLAUDE.md. We are on Sprint [X]. [Paste the prompt from Playbook]"

STEP 4: Review the output
        - Does it follow multi-tenancy rules?
        - Does the UI use Vaasenk design tokens?
        - Are all 5 component states handled?
        - Does the API validate inputs?

STEP 5: Test it
        - Backend: hit endpoints with curl/Postman
        - Frontend: check all states visually
        - Run: turbo lint && turbo typecheck

STEP 6: Commit
        git add . && git commit -m "feat(sprint-X): [description]"

STEP 7: /clear and start the next session
```

---

## Quick Reference: Which Agent for Which Task

When activating Agency Agents, use these:

| Sprint Task | Say This |
|-------------|----------|
| Prisma schema, API endpoints | "Activate Backend Architect" |
| React pages, components | "Activate Frontend Developer" |
| Visual polish, design tokens | "Activate UI Designer" |
| Mobile screens (Expo) | "Activate Frontend Developer, focus on React Native" |
| Auth, guards, security | "Activate Security Engineer" |
| Docker, CI/CD, deploy | "Activate DevOps Engineer" |
| Code review after feature | "Activate Reality Checker — review my last changes" |
| Stuck on architecture | "Activate Backend Architect — I need to discuss [problem]" |

---

## Emergency Prompts

### When Claude Code Ignores Your Design System:
```
STOP. You are not following the Vaasenk design system.
Re-read CLAUDE.md section 4. Specifically:
- Background must be Cream Canvas (#FFF7EA), not white
- Cards must use glassmorphism with 24px radius
- Primary buttons must use Brand Flame gradient
- Import colors from packages/ui/tokens — never hardcode hex values
Redo the component following these rules exactly.
```

### When Claude Code Skips Multi-Tenancy:
```
STOP. This query does not include institutionId.
Re-read CLAUDE.md section 3. EVERY Prisma query MUST filter by institutionId.
This is a security requirement. Fix all queries in this file.
```

### When Claude Code Over-Engineers:
```
STOP. This is too complex for the current sprint.
We are on Sprint [X]. The goal is [specific feature].
Simplify this to the minimum that fulfills the acceptance criteria.
We will add [complex thing] in Sprint [Y].
```

### When You Need to Understand a PRD Section:
```
Read docs/Vaasenk_Role_Based_Feature_Flow_Spec_v0.1.pdf section [X.Y]
for the detailed feature spec including acceptance criteria, edge cases,
error states, and permissions. Implement exactly what it describes.
```
