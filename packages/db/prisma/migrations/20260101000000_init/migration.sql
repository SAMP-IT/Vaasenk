-- Vaasenk baseline schema (squashed init migration).
-- Generated via: prisma migrate diff --from-empty --to-schema-datamodel
-- Contains the pgvector extension + all 27 core tables, enums, FKs and
-- indexes. The HNSW ANN index (previously its own migration) is appended
-- at the end. Replaces the four prior additive migrations (no DB had them
-- applied — clean pre-launch squash).

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'AI_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('UNIT_TEST', 'MONTHLY_TEST', 'QUARTERLY', 'HALF_YEARLY', 'ANNUAL', 'REVISION_TEST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "NoteTag" AS ENUM ('IMPORTANT', 'HOMEWORK', 'REVISION', 'FORMULA', 'ASSIGNMENT', 'EXAM');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NOTE_PUBLISHED', 'PAPER_READY', 'PAPER_GENERATED', 'PAPER_FAILED', 'AI_READY', 'SYLLABUS_PROCESSED', 'SYLLABUS_READY', 'SYLLABUS_FAILED', 'CLASSROOM_INVITE', 'CLASSROOM_JOINED', 'DOUBT_RECEIVED', 'DOUBT_REPLIED', 'AI_CREDITS_LOW', 'SYSTEM', 'SYSTEM_ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'TRIAL', 'STARTER', 'GROWTH', 'INSTITUTION');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PaperJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "board_type" TEXT,
    "address" TEXT,
    "contact_person" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "website_url" TEXT,
    "logo_url" TEXT,
    "locale" TEXT DEFAULT 'en-IN',
    "timezone" TEXT DEFAULT 'Asia/Kolkata',
    "subscription_plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "avatar_url" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "employee_code" TEXT,
    "department" TEXT,
    "subjects" TEXT[],
    "bio" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "admission_no" TEXT NOT NULL,
    "class_id" UUID,
    "section_id" UUID,
    "roll_no" TEXT,
    "date_of_birth" DATE,
    "parent_name" TEXT,
    "parent_phone" TEXT,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "board_type" TEXT,
    "grade_level" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_documents" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "class_id" UUID,
    "subject_id" UUID,
    "board_type" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "file_url" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "page_count" INTEGER,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabus_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "syllabus_chunks" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "syllabus_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER,
    "page_number" INTEGER,
    "chapter" TEXT,
    "topic" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "syllabus_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_question_papers" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "class_id" UUID,
    "subject_id" UUID,
    "syllabus_id" UUID,
    "board_type" TEXT,
    "name" TEXT NOT NULL,
    "exam_type" "ExamType" NOT NULL,
    "year" INTEGER,
    "term" TEXT,
    "priority" TEXT,
    "file_url" TEXT NOT NULL,
    "file_size_bytes" BIGINT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "error_message" TEXT,
    "extraction_meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_question_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classrooms" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "academic_year_id" UUID,
    "class_id" UUID NOT NULL,
    "section_id" UUID,
    "subject_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "syllabus_id" UUID,
    "name" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "invite_expires_at" TIMESTAMP(3),
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classrooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classroom_members" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "Status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classroom_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "file_url" TEXT,
    "file_type" TEXT,
    "file_size_bytes" BIGINT,
    "thumbnail_url" TEXT,
    "tags" "NoteTag"[],
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "download_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "note_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_paper_jobs" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "syllabus_id" UUID,
    "input_config" JSONB NOT NULL,
    "status" "PaperJobStatus" NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "output_file_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_paper_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_papers" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "exam_type" "ExamType" NOT NULL,
    "total_marks" INTEGER NOT NULL,
    "duration_minutes" INTEGER,
    "file_url" TEXT,
    "answer_key_file_url" TEXT,
    "structured_content" JSONB NOT NULL,
    "ai_confidence" DECIMAL(5,4),
    "status" "NoteStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_papers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chatbots" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "classroom_id" UUID NOT NULL,
    "syllabus_id" UUID,
    "vector_collection_id" TEXT,
    "status" "ProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "enabled_for_students" BOOLEAN NOT NULL DEFAULT false,
    "system_prompt" TEXT,
    "model_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chatbots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_sessions" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "chatbot_id" UUID NOT NULL,
    "classroom_id" UUID,
    "teacher_id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_chat_messages" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations_json" JSONB,
    "safety_status" TEXT,
    "token_count" INTEGER,
    "model_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "user_id" UUID,
    "classroom_id" UUID,
    "operation" TEXT NOT NULL,
    "provider" TEXT,
    "model_name" TEXT,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "latency_ms" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vector_embeddings" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "syllabus_id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "namespace" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model_name" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vector_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "metadata" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billing_cycle" TEXT,
    "price_inr" DECIMAL(10,2),
    "started_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "ai_credits_monthly" INTEGER NOT NULL DEFAULT 0,
    "ai_credits_used" INTEGER NOT NULL DEFAULT 0,
    "user_limit" INTEGER NOT NULL DEFAULT 5,
    "storage_limit_gb" DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    "storage_used_gb" DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    "external_payment_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "invited_by_id" UUID NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "institution_id" UUID NOT NULL,
    "expo_push_token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "device_name" TEXT,
    "app_version" TEXT,
    "os_version" TEXT,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "institutions_status_idx" ON "institutions"("status");

-- CreateIndex
CREATE INDEX "users_institution_id_idx" ON "users"("institution_id");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_institution_email_uniq" ON "users"("institution_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_institution_phone_uniq" ON "users"("institution_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_user_id_key" ON "teachers"("user_id");

-- CreateIndex
CREATE INDEX "teachers_institution_id_idx" ON "teachers"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_institution_employee_code_uniq" ON "teachers"("institution_id", "employee_code");

-- CreateIndex
CREATE UNIQUE INDEX "students_user_id_key" ON "students"("user_id");

-- CreateIndex
CREATE INDEX "students_institution_id_idx" ON "students"("institution_id");

-- CreateIndex
CREATE INDEX "students_class_id_idx" ON "students"("class_id");

-- CreateIndex
CREATE INDEX "students_section_id_idx" ON "students"("section_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_institution_admission_no_uniq" ON "students"("institution_id", "admission_no");

-- CreateIndex
CREATE INDEX "academic_years_institution_id_idx" ON "academic_years"("institution_id");

-- CreateIndex
CREATE INDEX "academic_years_is_active_idx" ON "academic_years"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_institution_name_uniq" ON "academic_years"("institution_id", "name");

-- CreateIndex
CREATE INDEX "classes_institution_id_idx" ON "classes"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "classes_institution_name_uniq" ON "classes"("institution_id", "name");

-- CreateIndex
CREATE INDEX "sections_institution_id_idx" ON "sections"("institution_id");

-- CreateIndex
CREATE INDEX "sections_class_id_idx" ON "sections"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_class_name_uniq" ON "sections"("class_id", "name");

-- CreateIndex
CREATE INDEX "subjects_institution_id_idx" ON "subjects"("institution_id");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_institution_name_uniq" ON "subjects"("institution_id", "name");

-- CreateIndex
CREATE INDEX "syllabus_documents_institution_id_idx" ON "syllabus_documents"("institution_id");

-- CreateIndex
CREATE INDEX "syllabus_documents_class_id_idx" ON "syllabus_documents"("class_id");

-- CreateIndex
CREATE INDEX "syllabus_documents_subject_id_idx" ON "syllabus_documents"("subject_id");

-- CreateIndex
CREATE INDEX "syllabus_documents_status_idx" ON "syllabus_documents"("status");

-- CreateIndex
CREATE INDEX "syllabus_documents_is_active_idx" ON "syllabus_documents"("is_active");

-- CreateIndex
CREATE INDEX "syllabus_chunks_institution_id_idx" ON "syllabus_chunks"("institution_id");

-- CreateIndex
CREATE INDEX "syllabus_chunks_syllabus_id_idx" ON "syllabus_chunks"("syllabus_id");

-- CreateIndex
CREATE UNIQUE INDEX "syllabus_chunks_syllabus_chunk_index_uniq" ON "syllabus_chunks"("syllabus_id", "chunk_index");

-- CreateIndex
CREATE INDEX "sample_question_papers_institution_id_idx" ON "sample_question_papers"("institution_id");

-- CreateIndex
CREATE INDEX "sample_question_papers_class_id_idx" ON "sample_question_papers"("class_id");

-- CreateIndex
CREATE INDEX "sample_question_papers_subject_id_idx" ON "sample_question_papers"("subject_id");

-- CreateIndex
CREATE INDEX "sample_question_papers_syllabus_id_idx" ON "sample_question_papers"("syllabus_id");

-- CreateIndex
CREATE INDEX "sample_question_papers_status_idx" ON "sample_question_papers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_invite_code_key" ON "classrooms"("invite_code");

-- CreateIndex
CREATE INDEX "classrooms_institution_id_idx" ON "classrooms"("institution_id");

-- CreateIndex
CREATE INDEX "classrooms_academic_year_id_idx" ON "classrooms"("academic_year_id");

-- CreateIndex
CREATE INDEX "classrooms_class_id_idx" ON "classrooms"("class_id");

-- CreateIndex
CREATE INDEX "classrooms_section_id_idx" ON "classrooms"("section_id");

-- CreateIndex
CREATE INDEX "classrooms_subject_id_idx" ON "classrooms"("subject_id");

-- CreateIndex
CREATE INDEX "classrooms_teacher_id_idx" ON "classrooms"("teacher_id");

-- CreateIndex
CREATE INDEX "classrooms_syllabus_id_idx" ON "classrooms"("syllabus_id");

-- CreateIndex
CREATE INDEX "classrooms_status_idx" ON "classrooms"("status");

-- CreateIndex
CREATE UNIQUE INDEX "classrooms_class_section_subject_year_uniq" ON "classrooms"("class_id", "section_id", "subject_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "classroom_members_institution_id_idx" ON "classroom_members"("institution_id");

-- CreateIndex
CREATE INDEX "classroom_members_classroom_id_idx" ON "classroom_members"("classroom_id");

-- CreateIndex
CREATE INDEX "classroom_members_user_id_idx" ON "classroom_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "classroom_members_classroom_user_uniq" ON "classroom_members"("classroom_id", "user_id");

-- CreateIndex
CREATE INDEX "notes_institution_id_idx" ON "notes"("institution_id");

-- CreateIndex
CREATE INDEX "notes_classroom_id_idx" ON "notes"("classroom_id");

-- CreateIndex
CREATE INDEX "notes_teacher_id_idx" ON "notes"("teacher_id");

-- CreateIndex
CREATE INDEX "notes_status_idx" ON "notes"("status");

-- CreateIndex
CREATE INDEX "notes_published_at_idx" ON "notes"("published_at");

-- CreateIndex
CREATE INDEX "bookmarks_institution_id_idx" ON "bookmarks"("institution_id");

-- CreateIndex
CREATE INDEX "bookmarks_user_id_idx" ON "bookmarks"("user_id");

-- CreateIndex
CREATE INDEX "bookmarks_note_id_idx" ON "bookmarks"("note_id");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_user_note_uniq" ON "bookmarks"("user_id", "note_id");

-- CreateIndex
CREATE INDEX "question_paper_jobs_institution_id_idx" ON "question_paper_jobs"("institution_id");

-- CreateIndex
CREATE INDEX "question_paper_jobs_classroom_id_idx" ON "question_paper_jobs"("classroom_id");

-- CreateIndex
CREATE INDEX "question_paper_jobs_teacher_id_idx" ON "question_paper_jobs"("teacher_id");

-- CreateIndex
CREATE INDEX "question_paper_jobs_syllabus_id_idx" ON "question_paper_jobs"("syllabus_id");

-- CreateIndex
CREATE INDEX "question_paper_jobs_status_idx" ON "question_paper_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "question_papers_job_id_key" ON "question_papers"("job_id");

-- CreateIndex
CREATE INDEX "question_papers_institution_id_idx" ON "question_papers"("institution_id");

-- CreateIndex
CREATE INDEX "question_papers_classroom_id_idx" ON "question_papers"("classroom_id");

-- CreateIndex
CREATE INDEX "question_papers_teacher_id_idx" ON "question_papers"("teacher_id");

-- CreateIndex
CREATE INDEX "question_papers_exam_type_idx" ON "question_papers"("exam_type");

-- CreateIndex
CREATE INDEX "question_papers_status_idx" ON "question_papers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_chatbots_classroom_id_key" ON "ai_chatbots"("classroom_id");

-- CreateIndex
CREATE INDEX "ai_chatbots_institution_id_idx" ON "ai_chatbots"("institution_id");

-- CreateIndex
CREATE INDEX "ai_chatbots_syllabus_id_idx" ON "ai_chatbots"("syllabus_id");

-- CreateIndex
CREATE INDEX "ai_chatbots_status_idx" ON "ai_chatbots"("status");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_institution_id_idx" ON "ai_chat_sessions"("institution_id");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_chatbot_id_idx" ON "ai_chat_sessions"("chatbot_id");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_classroom_id_idx" ON "ai_chat_sessions"("classroom_id");

-- CreateIndex
CREATE INDEX "ai_chat_sessions_teacher_id_idx" ON "ai_chat_sessions"("teacher_id");

-- CreateIndex
CREATE INDEX "ai_chat_messages_institution_id_idx" ON "ai_chat_messages"("institution_id");

-- CreateIndex
CREATE INDEX "ai_chat_messages_session_id_idx" ON "ai_chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "ai_chat_messages_created_at_idx" ON "ai_chat_messages"("created_at");

-- CreateIndex
CREATE INDEX "ai_usage_logs_institution_id_idx" ON "ai_usage_logs"("institution_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_user_id_idx" ON "ai_usage_logs"("user_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_classroom_id_idx" ON "ai_usage_logs"("classroom_id");

-- CreateIndex
CREATE INDEX "ai_usage_logs_operation_idx" ON "ai_usage_logs"("operation");

-- CreateIndex
CREATE INDEX "ai_usage_logs_created_at_idx" ON "ai_usage_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vector_embeddings_chunk_id_key" ON "vector_embeddings"("chunk_id");

-- CreateIndex
CREATE INDEX "vector_embeddings_institution_id_idx" ON "vector_embeddings"("institution_id");

-- CreateIndex
CREATE INDEX "vector_embeddings_syllabus_id_idx" ON "vector_embeddings"("syllabus_id");

-- CreateIndex
CREATE INDEX "vector_embeddings_namespace_idx" ON "vector_embeddings"("namespace");

-- CreateIndex
CREATE INDEX "notifications_institution_id_idx" ON "notifications"("institution_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_read_at_idx" ON "notifications"("read_at");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "audit_logs_institution_id_idx" ON "audit_logs"("institution_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "subscriptions_institution_id_idx" ON "subscriptions"("institution_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_idx" ON "subscriptions"("plan");

-- CreateIndex
CREATE INDEX "subscriptions_expires_at_idx" ON "subscriptions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_institution_id_idx" ON "invites"("institution_id");

-- CreateIndex
CREATE INDEX "invites_token_idx" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_expires_at_idx" ON "invites"("expires_at");

-- CreateIndex
CREATE INDEX "invites_accepted_at_idx" ON "invites"("accepted_at");

-- CreateIndex
CREATE UNIQUE INDEX "invites_institution_email_uniq" ON "invites"("institution_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_expo_push_token_key" ON "device_tokens"("expo_push_token");

-- CreateIndex
CREATE INDEX "device_tokens_user_id_idx" ON "device_tokens"("user_id");

-- CreateIndex
CREATE INDEX "device_tokens_institution_id_idx" ON "device_tokens"("institution_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_documents" ADD CONSTRAINT "syllabus_documents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_chunks" ADD CONSTRAINT "syllabus_chunks_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "syllabus_chunks" ADD CONSTRAINT "syllabus_chunks_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_question_papers" ADD CONSTRAINT "sample_question_papers_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_question_papers" ADD CONSTRAINT "sample_question_papers_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_question_papers" ADD CONSTRAINT "sample_question_papers_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_question_papers" ADD CONSTRAINT "sample_question_papers_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_jobs" ADD CONSTRAINT "question_paper_jobs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_jobs" ADD CONSTRAINT "question_paper_jobs_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_jobs" ADD CONSTRAINT "question_paper_jobs_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_paper_jobs" ADD CONSTRAINT "question_paper_jobs_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_papers" ADD CONSTRAINT "question_papers_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "question_paper_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chatbots" ADD CONSTRAINT "ai_chatbots_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chatbots" ADD CONSTRAINT "ai_chatbots_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chatbots" ADD CONSTRAINT "ai_chatbots_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_chatbot_id_fkey" FOREIGN KEY ("chatbot_id") REFERENCES "ai_chatbots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_sessions" ADD CONSTRAINT "ai_chat_sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "ai_chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_classroom_id_fkey" FOREIGN KEY ("classroom_id") REFERENCES "classrooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vector_embeddings" ADD CONSTRAINT "vector_embeddings_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vector_embeddings" ADD CONSTRAINT "vector_embeddings_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "syllabus_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vector_embeddings" ADD CONSTRAINT "vector_embeddings_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "syllabus_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- pgvector HNSW index for cosine ANN search (RAG retrieval; <=> + 
-- vector_cosine_ops). Requires pgvector >= 0.5.0 (Supabase Postgres 15+).
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "vector_embeddings_embedding_hnsw_idx"
  ON "vector_embeddings"
  USING hnsw (embedding vector_cosine_ops);
