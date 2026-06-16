#!/usr/bin/env bash
# Vaasenk — local development bootstrap.
#
# One-shot: bring up the docker stack, wait for Postgres, run migrations
# (creating the schema in a fresh DB), and seed demo data.
#
# Usage:
#   ./infrastructure/scripts/setup.sh
#
# Re-run safely: the seed script is idempotent (clears the Demo School
# institution and rebuilds), and prisma migrate dev is a no-op when nothing
# has changed.

set -euo pipefail

# Resolve repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

COMPOSE_FILE="infrastructure/docker-compose.yml"

# Prefer the modern `docker compose` subcommand; fall back to docker-compose v1.
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is available on PATH." >&2
  exit 1
fi

echo "▸ Starting Vaasenk docker stack…"
${DC} -f "${COMPOSE_FILE}" up -d postgres redis minio minio-init

echo "▸ Waiting for Postgres to accept connections (timeout: 60s)…"
deadline=$(( $(date +%s) + 60 ))
until docker exec vaasenk-postgres pg_isready -U postgres -d vaasenk >/dev/null 2>&1; do
  if (( $(date +%s) >= deadline )); then
    echo "ERROR: Postgres did not become ready within 60s." >&2
    ${DC} -f "${COMPOSE_FILE}" logs postgres | tail -40 >&2
    exit 1
  fi
  sleep 1
done
echo "  Postgres ready."

echo "▸ Verifying pgvector extension…"
docker exec vaasenk-postgres psql -U postgres -d vaasenk -tAc \
  "SELECT extname FROM pg_extension WHERE extname = 'vector';" \
  | grep -q vector \
  && echo "  pgvector installed." \
  || { echo "ERROR: pgvector extension missing." >&2; exit 1; }

echo "▸ Running Prisma migrations…"
(
  cd packages/db
  npx prisma migrate dev --name init --skip-seed
)

echo "▸ Seeding demo data…"
(
  cd packages/db
  npx prisma db seed
)

cat <<EOF

✓ Vaasenk local infrastructure ready.

  Postgres:   postgresql://postgres:postgres@localhost:5432/vaasenk
  Redis:      redis://localhost:6379
  MinIO API:  http://localhost:9000
  MinIO UI:   http://localhost:9001  (minioadmin / minioadmin)
  Bucket:     vaasenk-storage

  Start the apps:   npm run dev
  Open Prisma:      npm run db:studio

EOF
