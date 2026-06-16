# Vaasenk — local development bootstrap (Windows PowerShell).
#
# One-shot: bring up the docker stack, wait for Postgres, run migrations
# (creating the schema in a fresh DB), and seed demo data. Mirror of
# setup.sh for Windows-native developers.
#
# Usage:
#   pwsh -File infrastructure/scripts/setup.ps1
#   # or, from PowerShell:
#   ./infrastructure/scripts/setup.ps1
#
# Re-run safely: the seed script is idempotent (clears the Demo School
# institution and rebuilds), and `prisma migrate dev` is a no-op when
# nothing has changed.

$ErrorActionPreference = 'Stop'

# Resolve repo root regardless of where the script is invoked from.
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $repoRoot

$composeFile = 'infrastructure/docker-compose.yml'

# Prefer `docker compose` v2; fall back to legacy `docker-compose` v1.
function Test-DockerComposeV2 {
    try {
        & docker compose version *> $null
        return ($LASTEXITCODE -eq 0)
    } catch {
        return $false
    }
}

if (Test-DockerComposeV2) {
    $dc = @('docker', 'compose')
} elseif (Get-Command docker-compose -ErrorAction SilentlyContinue) {
    $dc = @('docker-compose')
} else {
    Write-Error "Neither 'docker compose' nor 'docker-compose' is available on PATH."
    exit 1
}

Write-Host "> Starting Vaasenk docker stack..."
& $dc[0] $dc[1..($dc.Count - 1)] -f $composeFile up -d postgres redis minio minio-init
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed." }

Write-Host "> Waiting for Postgres to accept connections (timeout: 60s)..."
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    & docker exec vaasenk-postgres pg_isready -U postgres -d vaasenk *> $null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Error "Postgres did not become ready within 60s."
    & $dc[0] $dc[1..($dc.Count - 1)] -f $composeFile logs postgres | Select-Object -Last 40 | Write-Host
    exit 1
}
Write-Host "  Postgres ready."

Write-Host "> Verifying pgvector extension..."
$extResult = & docker exec vaasenk-postgres psql -U postgres -d vaasenk -tAc "SELECT extname FROM pg_extension WHERE extname = 'vector';"
if ($LASTEXITCODE -ne 0 -or ($extResult -notmatch '^\s*vector\s*$')) {
    Write-Error "pgvector extension missing (got: '$extResult')."
    exit 1
}
Write-Host "  pgvector installed."

Write-Host "> Running Prisma migrations..."
Push-Location (Join-Path $repoRoot 'packages/db')
try {
    & npx prisma migrate dev --name init --skip-seed
    if ($LASTEXITCODE -ne 0) { throw "prisma migrate dev failed." }
} finally {
    Pop-Location
}

Write-Host "> Seeding demo data..."
Push-Location (Join-Path $repoRoot 'packages/db')
try {
    & npx prisma db seed
    if ($LASTEXITCODE -ne 0) { throw "prisma db seed failed." }
} finally {
    Pop-Location
}

@"

OK Vaasenk local infrastructure ready.

  Postgres:   postgresql://postgres:postgres@localhost:5432/vaasenk
  Redis:      redis://localhost:6379
  MinIO API:  http://localhost:9000
  MinIO UI:   http://localhost:9001  (minioadmin / minioadmin)
  Bucket:     vaasenk-storage

  Start the apps:   npm run dev
  Open Prisma:      npm run db:studio

"@ | Write-Host
