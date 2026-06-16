/**
 * Pre-flight DB assertion for the tenant-isolation CI job.
 *
 * Closes a silent-green hole the test-count guard CANNOT see: the API's
 * PrismaService deliberately "starts anyway" if it can't connect at boot
 * (correct for production, dangerous for a security test). That means a
 * wrong-but-reachable DATABASE_URL would NOT fail the app — the suite could run
 * against the wrong database and still go green.
 *
 * This script connects via the SAME DATABASE_URL the suite uses and fails LOUD
 * (non-zero exit) unless:
 *   - the connection genuinely succeeds (no swallowed error), AND
 *   - the connected database name matches the one in DATABASE_URL, AND
 *   - the schema is actually present (the `institutions` table exists).
 *
 * Run BEFORE the suite. If this fails, the suite never runs and the build is red.
 */
const { PrismaClient } = require('@prisma/client');

function fail(msg) {
  console.error(`\n❌ DB PRE-FLIGHT FAILED: ${msg}\n`);
  process.exit(1);
}

function expectedDbNameFromUrl(url) {
  try {
    // pathname is "/<dbname>"; strip query string handled by URL.
    const u = new URL(url);
    return decodeURIComponent(u.pathname.replace(/^\//, '')) || null;
  } catch {
    return null;
  }
}

(async () => {
  const url = process.env.DATABASE_URL;
  if (!url) fail('DATABASE_URL is not set.');

  const expected = expectedDbNameFromUrl(url);
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    const actual = rows?.[0]?.db;
    if (!actual) fail('could not read current_database().');
    if (expected && actual !== expected) {
      fail(
        `connected to database "${actual}" but DATABASE_URL names "${expected}". ` +
          `The suite must run against its own ephemeral DB.`,
      );
    }

    // Schema present? institutions is a core table created by `prisma db push`.
    const count = await prisma.institution.count();
    console.log(
      `✅ DB pre-flight OK: connected to "${actual}", schema present ` +
        `(institutions table reachable, ${count} row(s)).`,
    );
  } catch (e) {
    fail(`could not query the database: ${e.message}`);
  } finally {
    await prisma.$disconnect();
  }
})();
