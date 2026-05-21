# 06 — Data Model & Multi-Tenancy Spec

**Date:** 2026-05-21
**Status:** Draft for review
**Depends on:** `00`, `01`, `05`

---

## 1. Tenancy principle

**Every domain row is owned by exactly one institution.** Tenancy is enforced at three layers:

1. **Schema**: every domain table has `institution_id UUID NOT NULL` with FK to `institutions(id)`.
2. **Database**: PostgreSQL Row-Level Security (RLS) policies filter `institution_id = current_setting('vaasenk.institution_id')::uuid`.
3. **Application**: the backend sets the session GUC `vaasenk.institution_id` from the authenticated user's session at the start of every transaction. Forgetting this = no rows returned (RLS denies by default). This fail-closed behaviour is intentional.

`super_admin` users bypass RLS via a separate role; their access is audited.

## 2. ID strategy

- All primary keys are `UUID v7` (time-sortable, generated DB-side via `uuid_generate_v7()` extension).
- Composite uniqueness via `UNIQUE (institution_id, ...)` constraints so a duplicate value in another tenant doesn't conflict.
- Foreign keys always include `institution_id` in composites where applicable (defensive — prevents accidental cross-tenant references).

## 3. Soft delete

A `status` enum on most tables: `'active' | 'archived' | 'deleted'`. Hard delete is reserved for compliance requests (handled via a separate audited path). Queries filter `WHERE status != 'deleted'` by default.

## 4. Schema

The complete Phase 1+2 schema. Indexes called out per table.

### 4.1 Tenancy & identity

```sql
CREATE TABLE institutions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK (type IN ('school','college','coaching')),
  board_type      TEXT,                          -- 'CBSE' | 'ICSE' | 'State' | 'University' | 'Custom'
  address         JSONB,
  subscription_plan_id UUID,
  subscription_status TEXT NOT NULL DEFAULT 'trial', -- 'trial' | 'active' | 'past_due' | 'cancelled'
  trial_ends_at   TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active',
  settings        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON institutions (status);

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  name            TEXT NOT NULL,
  email           CITEXT,
  phone           TEXT,
  password_hash   TEXT,
  role            TEXT NOT NULL CHECK (role IN ('super_admin','admin','teacher','student')),
  status          TEXT NOT NULL DEFAULT 'active',
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_or_phone CHECK (email IS NOT NULL OR phone IS NOT NULL),
  UNIQUE (institution_id, email),
  UNIQUE (institution_id, phone)
);
CREATE INDEX ON users (institution_id, role, status);

CREATE TABLE teachers (
  user_id         UUID PRIMARY KEY REFERENCES users(id),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  employee_code   TEXT,
  department      TEXT,
  UNIQUE (institution_id, employee_code)
);

CREATE TABLE students (
  user_id         UUID PRIMARY KEY REFERENCES users(id),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  admission_no    TEXT,
  primary_class_id    UUID,                      -- FK to classes
  primary_section_id  UUID,
  UNIQUE (institution_id, admission_no)
);

CREATE TABLE invitations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  email           CITEXT,
  phone           TEXT,
  role            TEXT NOT NULL CHECK (role IN ('admin','teacher','student')),
  token_hash      TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at      TIMESTAMPTZ NOT NULL,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON invitations (institution_id, status);
```

### 4.2 Academic structure

```sql
CREATE TABLE academic_years (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  name            TEXT NOT NULL,                 -- '2025-26'
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (institution_id, name)
);

CREATE TABLE classes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  name            TEXT NOT NULL,                 -- 'Class 10'
  grade_level     INT,
  UNIQUE (institution_id, name)
);

CREATE TABLE sections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  class_id        UUID NOT NULL REFERENCES classes(id),
  name            TEXT NOT NULL,                 -- 'A'
  UNIQUE (class_id, name)
);

CREATE TABLE subjects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  name            TEXT NOT NULL,
  code            TEXT,
  UNIQUE (institution_id, name)
);

CREATE TABLE teacher_subject_assignments (
  teacher_id      UUID NOT NULL REFERENCES teachers(user_id),
  subject_id      UUID NOT NULL REFERENCES subjects(id),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  PRIMARY KEY (teacher_id, subject_id)
);
```

### 4.3 Classrooms

```sql
CREATE TABLE classrooms (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  class_id        UUID NOT NULL REFERENCES classes(id),
  section_id      UUID NOT NULL REFERENCES sections(id),
  subject_id      UUID NOT NULL REFERENCES subjects(id),
  primary_teacher_id  UUID NOT NULL REFERENCES teachers(user_id),
  academic_year_id    UUID NOT NULL REFERENCES academic_years(id),
  syllabus_id     UUID,                          -- FK below
  invite_code     CHAR(6) NOT NULL,
  bot_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  status          TEXT NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, invite_code),
  UNIQUE (institution_id, class_id, section_id, subject_id, academic_year_id)
);
CREATE INDEX ON classrooms (institution_id, status);

CREATE TABLE classroom_members (
  classroom_id    UUID NOT NULL REFERENCES classrooms(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  role_in_classroom TEXT NOT NULL CHECK (role_in_classroom IN ('teacher','student','observer')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'active',
  PRIMARY KEY (classroom_id, user_id)
);
CREATE INDEX ON classroom_members (user_id, status);

CREATE TABLE classroom_sample_paper_mapping (
  classroom_id    UUID NOT NULL REFERENCES classrooms(id),
  sample_paper_id UUID NOT NULL,
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  priority        INT NOT NULL DEFAULT 0,
  PRIMARY KEY (classroom_id, sample_paper_id)
);
```

### 4.4 Content (notes)

```sql
CREATE TABLE notes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  classroom_id    UUID NOT NULL REFERENCES classrooms(id),
  teacher_id      UUID NOT NULL REFERENCES teachers(user_id),
  title           TEXT NOT NULL,
  description     TEXT,
  primary_file_id UUID,                          -- FK to note_attachments
  tags            TEXT[] NOT NULL DEFAULT '{}',
  visibility      TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'published' | 'archived'
  ocr_text        TEXT,                          -- populated async
  ocr_status      TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX ON notes (classroom_id, visibility, published_at DESC);
CREATE INDEX ON notes USING gin (tags);

CREATE TABLE note_attachments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  note_id         UUID NOT NULL REFERENCES notes(id),
  file_url        TEXT NOT NULL,
  file_type       TEXT NOT NULL,                 -- 'image/jpeg' | 'application/pdf' | 'text/plain'
  file_size_bytes BIGINT NOT NULL,
  thumbnail_url   TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON note_attachments (note_id);

CREATE TABLE bookmarks (
  user_id         UUID NOT NULL REFERENCES users(id),
  note_id         UUID NOT NULL REFERENCES notes(id),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, note_id)
);

CREATE TABLE downloads_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  note_id         UUID NOT NULL REFERENCES notes(id),
  downloaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.5 AI knowledge & artefacts

```sql
CREATE TABLE syllabus_documents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  title           TEXT NOT NULL,
  board_type      TEXT,
  class_id        UUID REFERENCES classes(id),
  subject_id      UUID REFERENCES subjects(id),
  academic_year_id UUID REFERENCES academic_years(id),
  file_url        TEXT NOT NULL,
  language        TEXT,
  version         TEXT NOT NULL DEFAULT '1',
  status          TEXT NOT NULL DEFAULT 'uploaded',
    -- 'uploaded' | 'processing' | 'ai_ready' | 'failed' | 'archived'
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON syllabus_documents (institution_id, status);
CREATE INDEX ON syllabus_documents (institution_id, class_id, subject_id);

-- Add the classroom FK now that syllabus_documents exists.
ALTER TABLE classrooms
  ADD CONSTRAINT classrooms_syllabus_fk
  FOREIGN KEY (syllabus_id) REFERENCES syllabus_documents(id);

CREATE TABLE sample_question_papers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  title           TEXT NOT NULL,
  class_id        UUID REFERENCES classes(id),
  subject_id      UUID REFERENCES subjects(id),
  syllabus_id     UUID REFERENCES syllabus_documents(id),
  file_url        TEXT NOT NULL,
  exam_type       TEXT,                          -- 'midterm' | 'annual' | 'board' | 'custom'
  year            INT,
  term            TEXT,
  priority        INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'uploaded',
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON sample_question_papers (institution_id, status);

-- pgvector storage. One collection per syllabus_document; sample papers attach via metadata.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_chunks (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  source_type     TEXT NOT NULL CHECK (source_type IN ('syllabus','sample_paper')),
  source_id       UUID NOT NULL,                  -- syllabus_id or sample_paper_id
  syllabus_id     UUID REFERENCES syllabus_documents(id),  -- always populated (sample_paper uses its mapped syllabus)
  page            INT,
  chunk_index     INT NOT NULL,
  text            TEXT NOT NULL,
  embedding       vector(1536),                   -- swap dim per model
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON knowledge_chunks (institution_id, source_type, source_id);
CREATE INDEX ON knowledge_chunks (institution_id, syllabus_id);

CREATE TABLE document_processing_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  source_type     TEXT NOT NULL,
  source_id       UUID NOT NULL,
  stage           TEXT NOT NULL,                  -- 'extracting' | 'chunking' | 'embedding' | 'done'
  status          TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'success' | 'failed'
  error_reason    TEXT,
  retries         INT NOT NULL DEFAULT 0,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON document_processing_jobs (institution_id, status, created_at DESC);
```

### 4.6 AI chat

```sql
CREATE TABLE ai_chat_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  classroom_id    UUID NOT NULL REFERENCES classrooms(id),
  teacher_id      UUID NOT NULL REFERENCES teachers(user_id),
  title           TEXT,                          -- auto-generated from first message
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX ON ai_chat_sessions (teacher_id, last_activity_at DESC);
CREATE INDEX ON ai_chat_sessions (classroom_id, last_activity_at DESC);

CREATE TABLE ai_chat_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  session_id      UUID NOT NULL REFERENCES ai_chat_sessions(id),
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content         TEXT NOT NULL,
  citations       JSONB NOT NULL DEFAULT '[]',
  confidence      TEXT,
  groundedness    TEXT,
  safety_status   TEXT,
  tokens_in       INT,
  tokens_out      INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON ai_chat_messages (session_id, created_at);
```

### 4.7 Generated papers

```sql
CREATE TABLE question_paper_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  classroom_id    UUID NOT NULL REFERENCES classrooms(id),
  teacher_id      UUID NOT NULL REFERENCES teachers(user_id),
  input_config    JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',
  progress        INT NOT NULL DEFAULT 0,
  stage_label     TEXT,
  error_reason    TEXT,
  paper_id        UUID,                          -- set on success
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ
);
CREATE INDEX ON question_paper_jobs (institution_id, status);

CREATE TABLE question_papers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  classroom_id    UUID NOT NULL REFERENCES classrooms(id),
  teacher_id      UUID NOT NULL REFERENCES teachers(user_id),
  title           TEXT NOT NULL,
  total_marks     INT NOT NULL,
  duration_minutes INT NOT NULL,
  ai_confidence   TEXT,
  generated_from_job_id UUID REFERENCES question_paper_jobs(id),
  status          TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'reviewed' | 'published'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_paper_sections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  paper_id        UUID NOT NULL REFERENCES question_papers(id),
  position        INT NOT NULL,
  title           TEXT,
  instructions    TEXT
);

CREATE TABLE question_paper_questions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  section_id      UUID NOT NULL REFERENCES question_paper_sections(id),
  position        INT NOT NULL,
  type            TEXT NOT NULL,
  marks           INT NOT NULL,
  text            TEXT NOT NULL,
  expected_answer TEXT,
  difficulty      TEXT,
  topic_reference TEXT,
  citations       JSONB NOT NULL DEFAULT '[]',
  flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 4.8 Usage metering

```sql
CREATE TABLE usage_metering (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  classroom_id    UUID REFERENCES classrooms(id),
  user_id         UUID REFERENCES users(id),
  feature         TEXT NOT NULL,                 -- 'chat' | 'paper_gen' | 'doc_ingest'
  tokens          INT NOT NULL DEFAULT 0,
  jobs            INT NOT NULL DEFAULT 0,
  month           DATE NOT NULL,                 -- first of month
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON usage_metering (institution_id, month);
```

### 4.9 Notifications, audit, analytics

```sql
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  type            TEXT NOT NULL,
  payload         JSONB NOT NULL,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (user_id, read_at, created_at DESC);

CREATE TABLE audit_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v7(),
  institution_id  UUID NOT NULL REFERENCES institutions(id),
  actor_id        UUID REFERENCES users(id),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  metadata        JSONB,
  ip              INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_logs (institution_id, created_at DESC);
```

## 5. Row-Level Security policy template

Applied to every domain table:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <table>
  USING (institution_id = current_setting('vaasenk.institution_id')::uuid);

CREATE POLICY super_admin_bypass ON <table>
  TO super_admin
  USING (true);
```

The backend sets the GUC at the start of every request transaction:

```sql
SET LOCAL vaasenk.institution_id = '<uuid from session>';
```

If the GUC is unset, RLS evaluates to false → zero rows returned. Fail-closed by design.

## 6. Mock data shapes (Phase 1)

The web app's `/web/lib/mock/` directory exports typed fixtures matching every entity above. TypeScript types are derived from the schema via a code-gen script (or hand-written and kept in sync). Each Query hook in `/web/lib/api/` imports the mock fixture in Phase 1 and switches to a real fetch call in Phase 2 — the component never knows.

Minimum fixtures for Phase 1:
- 1 institution
- 2 admins
- 6 teachers
- 80 students (across 4 classrooms)
- 4 classes × 3 sections × 5 subjects
- 4 classrooms (one per subject, one teacher each)
- 4 syllabus documents (1 per classroom, varying statuses: 2 AI Ready, 1 Processing, 1 Failed)
- 8 sample papers
- 40 notes (varied: images, PDFs, text)
- 12 AI chat sessions across teachers
- 6 generated papers in varying states
- 30 notifications across users
- 100 processing job rows for realistic AI Monitor

## 7. Migration plan

Phase 1: no migrations needed (mock layer only).
Phase 2: introduce one migration tool (preferred: `node-pg-migrate` or Prisma migrate). First migration is the entire schema above. Subsequent migrations are additive only — no destructive migrations in production without an audit trail.

## 8. Backup & retention

- Daily logical backups (pg_dump) → S3 with 30-day retention.
- Continuous WAL archival → 7-day PITR window.
- Chat messages retained indefinitely (audit value); admin can request purge per compliance request.
- Generated papers retained indefinitely.
- Processing job logs retained 90 days, then archived.

## 9. Out of scope (Phase 1)

- Sharding (single Postgres instance suffices for early tenants).
- Read replicas (add when read load justifies).
- Switch to dedicated vector DB (pgvector is fine until ~10M chunks).
- Multi-region (single region; backups cross-region).
- GDPR/DPDP automation (manual process for first tenants).
