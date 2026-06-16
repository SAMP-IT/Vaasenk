-- Vaasenk Postgres bootstrap.
-- Mounted at /docker-entrypoint-initdb.d/ and executed once, the first time
-- the postgres data volume is created. Subsequent container restarts skip it.

-- pgvector (required by VectorEmbedding.embedding in packages/db/prisma/schema.prisma).
CREATE EXTENSION IF NOT EXISTS vector;

-- pgcrypto is handy for gen_random_uuid() in raw SQL migrations. Prisma's
-- @default(uuid()) is client-side so this is defense-in-depth only.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
