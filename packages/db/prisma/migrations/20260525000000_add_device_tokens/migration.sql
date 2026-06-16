-- Sprint 7.4 — Mobile push notifications via Expo Push API.
--
-- Adds a `device_tokens` table that stores one row per (user × physical
-- device). The Expo push token is globally unique so the registration
-- endpoint can upsert by token and transfer ownership when a different
-- user signs in on the same device.
--
-- Multi-tenant scoping (CLAUDE.md §3) — `institution_id` is required and
-- FKs to `institutions` with onDelete CASCADE so tearing down a tenant
-- removes every device row in lockstep with its users.
--
-- This migration is purely additive — no existing tables are modified.

-- 1. DevicePlatform enum -----------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DevicePlatform') THEN
    CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');
  END IF;
END
$$;

-- 2. device_tokens table -----------------------------------------------------

CREATE TABLE IF NOT EXISTS "device_tokens" (
  "id"               UUID            NOT NULL DEFAULT gen_random_uuid(),
  "user_id"          UUID            NOT NULL,
  "institution_id"   UUID            NOT NULL,
  "expo_push_token"  TEXT            NOT NULL,
  "platform"         "DevicePlatform" NOT NULL,
  "device_name"      TEXT,
  "app_version"      TEXT,
  "os_version"       TEXT,
  "last_seen_at"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "device_tokens_expo_push_token_key"
  ON "device_tokens" ("expo_push_token");

CREATE INDEX IF NOT EXISTS "device_tokens_user_id_idx"
  ON "device_tokens" ("user_id");

CREATE INDEX IF NOT EXISTS "device_tokens_institution_id_idx"
  ON "device_tokens" ("institution_id");

-- 3. Foreign keys ------------------------------------------------------------

ALTER TABLE "device_tokens"
  ADD CONSTRAINT "device_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "device_tokens"
  ADD CONSTRAINT "device_tokens_institution_id_fkey"
  FOREIGN KEY ("institution_id") REFERENCES "institutions" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
