/**
 * Fail-closed guard for the tenant-isolation security suite in CI.
 *
 * Jest's exit code already fails the build on a failing test or "no tests
 * found". This guard closes the remaining SILENT-GREEN holes that an exit code
 * alone does NOT catch:
 *   - the results file is missing entirely (jest never produced output → the
 *     suite did not run),
 *   - every test was `.skip`-ped (jest exits 0 with 0 passed, looks green),
 *   - the suite shrank below a sane floor (someone deleted the security tests).
 *
 * A skipped security suite is more dangerous than no suite because it looks
 * green. This guard makes "the suite did not genuinely execute" a hard build
 * failure.
 */
const fs = require('node:fs');
const path = require('node:path');

// EXACT expected test count — a security suite must not silently shrink OR
// gain a skipped test. Bump this DELIBERATELY when you add/remove tests; that
// forcing function is the point (you cannot quietly change the isolation suite).
const EXPECTED_TESTS = 46;

const resultsPath = path.join(__dirname, '..', 'test-results.json');

function fail(msg) {
  console.error(`\n❌ SECURITY SUITE GUARD FAILED: ${msg}\n`);
  process.exit(1);
}

if (!fs.existsSync(resultsPath)) {
  fail(
    `results file not found at ${resultsPath}. The tenant-isolation suite did ` +
      `not run — failing the build instead of passing silently.`,
  );
}

let results;
try {
  results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
} catch (e) {
  fail(`could not parse ${resultsPath}: ${e.message}`);
}

const total = results.numTotalTests ?? 0;
const passed = results.numPassedTests ?? 0;
const failed = results.numFailedTests ?? 0;
const skipped =
  (results.numPendingTests ?? 0) + (results.numTodoTests ?? 0);

console.log(
  `tenant-isolation suite → total=${total} passed=${passed} ` +
    `failed=${failed} skipped=${skipped} success=${results.success}`,
);

if (results.success !== true) fail('jest reported success=false.');
if (failed > 0) fail(`${failed} test(s) failed.`);
if (skipped > 0) {
  fail(`${skipped} test(s) were SKIPPED — the security suite must not skip.`);
}
if (total !== EXPECTED_TESTS) {
  fail(
    `expected exactly ${EXPECTED_TESTS} tests but found ${total}. The isolation ` +
      `suite changed size — if intentional, bump EXPECTED_TESTS; otherwise the ` +
      `suite was eroded. Failing closed.`,
  );
}
if (passed !== EXPECTED_TESTS) {
  fail(`expected ${EXPECTED_TESTS} passing but only ${passed} passed.`);
}

console.log(
  `✅ tenant-isolation security suite genuinely executed: ${passed}/${EXPECTED_TESTS} ` +
    `passing, 0 skipped, 0 failing.`,
);
