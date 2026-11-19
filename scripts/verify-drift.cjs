/**
 * Runs both schema-drift gates against a freshly built database.
 *
 * payroll.db is git-ignored, so CI has no database to check against. This
 * builds one from the migrations plus the boot-time reconciliation, then runs
 * the checks with DB_PATH pointed at it — so the gate tests the same schema a
 * real install produces, not whatever happens to be committed.
 *
 * Without this the drift checks would have nothing to compare and would pass
 * vacuously, which is how 60 missing columns reached production in the first
 * place.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const run = (script) =>
  spawnSync(process.execPath, [path.join(__dirname, script)], {
    encoding: 'utf8',
    cwd: ROOT,
  });

const build = run('build-test-db.cjs');
process.stdout.write(build.stdout || '');
if (build.status !== 0) {
  process.stderr.write(build.stderr || '');
  console.error('\nFAIL: could not build the throwaway database.');
  process.exit(1);
}

const env = { ...process.env, DB_PATH: 'scripts/.build/payroll.db' };
const checks = ['find-write-column-drift.cjs', 'find-sql-interpolation.cjs'];

let failed = 0;
for (const script of checks) {
  console.log(`\n--- ${script} ---`);
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    encoding: 'utf8',
    cwd: ROOT,
    env,
  });
  process.stdout.write(r.stdout || '');
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) failed++;
}

console.log('');
if (failed) {
  console.error(`FAIL: ${failed} drift gate(s) failed.`);
  process.exit(1);
}
console.log('OK: both drift gates passed.');
