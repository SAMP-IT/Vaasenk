-- Sprint 6 — Extend NotificationType enum (additive only).
--
-- PostgreSQL cannot remove enum values cleanly without a drop-rename
-- choreography, and we'd lose any rows that already reference a value. So
-- this migration is ADDITIVE only: we add the new canonical values and
-- leave the legacy ones (PAPER_READY, AI_READY, SYLLABUS_PROCESSED, SYSTEM)
-- dormant in the enum. Application code stops emitting them in this sprint;
-- they'll be removed in a future "compact" migration once we're confident
-- no stored rows reference them.
--
-- ALTER TYPE ... ADD VALUE must each run in their own transaction in
-- Postgres < 12. Prisma's migration engine wraps the file in a single
-- transaction, but `ADD VALUE IF NOT EXISTS` is idempotent and Supabase
-- (Postgres 15+) supports adding inside a transaction, so a single file is
-- safe. If a self-hosted target rejects it, split each ALTER into its own
-- migration step.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAPER_GENERATED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'PAPER_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYLLABUS_READY';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYLLABUS_FAILED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CLASSROOM_JOINED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOUBT_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'DOUBT_REPLIED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'AI_CREDITS_LOW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SYSTEM_ANNOUNCEMENT';
