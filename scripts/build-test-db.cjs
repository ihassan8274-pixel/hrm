/**
 * Builds a throwaway database from the migration files, for checks that need a
 * schema to resolve against.
 *
 * payroll.db is git-ignored, so on CI it does not exist and a drift check that
 * opens it would silently have nothing to compare. Running the real migrations
 * gives the checks a schema that matches production instead of a fixture.
 *
 * Output: scripts/.build/payroll.db
 */
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'scripts', '.build');
const OUT = path.join(OUT_DIR, 'payroll.db');

fs.mkdirSync(OUT_DIR, { recursive: true });
// Only the file this script writes is removed. The directory is shared with
// the integration test setup, and clearing all of it took the test
// environment file with it — which made the integration suite skip itself
// silently after an ordinary `npm test`.
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f === 'payroll.db') fs.unlinkSync(path.join(OUT_DIR, f));
}

const db = new D(OUT);

db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

const migDir = path.join(ROOT, 'server', 'db', 'migrations');
const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();

let applied = 0;
for (const f of files) {
  const version = parseInt(f.split('_')[0], 10);
  const already = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  if (already) continue;
  db.exec(fs.readFileSync(path.join(migDir, f), 'utf8'));
  db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(version, f);
  applied++;
}

// Tables and columns that the server adds at boot (schema.ts + reconciliation)
// are not in the .sql files, so replay them here or the drift checks compare
// against an incomplete schema.
//
// Loaded through tsx rather than imported, because importing the modules would
// open the real payroll.db via ../config/database.
const { spawnSync } = require('child_process');

// tsx is a devDependency and can load the TypeScript reconciliation module.
// cwd is set so the script path stays relative: an absolute path containing a
// space gets split into two arguments.
const applyReconciliation = spawnSync(
  'npx',
  ['tsx', 'scripts/apply-reconciliation-to-db.ts', path.relative(ROOT, OUT)],
  { encoding: 'utf8', cwd: ROOT, shell: process.platform === 'win32' }
);
if (applyReconciliation.stdout) process.stdout.write(applyReconciliation.stdout);
if (applyReconciliation.stderr) process.stderr.write(applyReconciliation.stderr);
if (applyReconciliation.status !== 0) {
  console.error('  reconciliation replay failed; drift checks would be meaningless');
  process.exit(1);
}

const tables = db
  .prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .get().c;
db.close();

console.log(`built ${path.relative(ROOT, OUT)}`);
console.log(`  migrations applied : ${applied}/${files.length}`);
console.log(`  tables             : ${tables}`);
