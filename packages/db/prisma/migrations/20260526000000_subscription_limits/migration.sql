-- Sprint 8.1 — Subscription limits + TRIAL plan.
--
-- Additive only:
--   • Adds 'TRIAL' enum value to SubscriptionPlan (idempotent ADD VALUE IF NOT EXISTS).
--   • Adds 3 columns to `subscriptions`:
--       - user_limit       (cap on ACTIVE users per institution)
--       - storage_limit_gb (cap on aggregate file storage in GB)
--       - storage_used_gb  (current observed usage, kept in sync by upload/delete sites)
--
-- All columns ship with a sensible FREE-tier default so existing rows are
-- backfilled to the conservative 5-user / 1.0 GB envelope. The application
-- bumps these to plan-specific values on the next PATCH /institutions/:id/subscription
-- (see apps/api/src/modules/subscriptions/plan-defaults.ts).
--
-- Storage usage backfill (sum of file_size_bytes across notes, syllabus,
-- sample papers per institution) is provided as a manual script at
-- apps/api/src/scripts/backfill-storage-usage.ts. It is NOT run by this
-- migration — sum-of-BigInt over potentially millions of rows is something
-- ops should kick off explicitly with monitoring on.

-- 1. SubscriptionPlan: add TRIAL ---------------------------------------------

ALTER TYPE "SubscriptionPlan" ADD VALUE IF NOT EXISTS 'TRIAL';

-- 2. subscriptions: add user_limit, storage_limit_gb, storage_used_gb --------

ALTER TABLE "subscriptions"
  ADD COLUMN IF NOT EXISTS "user_limit" INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS "storage_limit_gb" NUMERIC(10, 2) NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS "storage_used_gb"  NUMERIC(10, 2) NOT NULL DEFAULT 0.0;
