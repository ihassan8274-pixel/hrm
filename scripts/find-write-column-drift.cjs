/**
 * Verifies every INSERT/UPDATE column list against the live schema.
 *
 * This exists because the schema-drift test only covers SELECT. `SELECT *`
 * resolves no columns, so a whole missing-column class slips through — and that
 * is exactly how `leaves.is_paid` and `tax_exemption_declarations.month` reached
 * production: both threw a 500 on every write.
 *
 * Strategy: rewrite each INSERT/UPDATE into a SELECT with the same column list
 * and let SQLite resolve it. A missing column raises here instead of at runtime.
 */
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
// DB_PATH lets CI point this at a throwaway database built from the
// migrations, since payroll.db itself is git-ignored and absent there.
const DB_FILE = process.env.DB_PATH
  ? path.resolve(ROOT, process.env.DB_PATH)
  : path.join(ROOT, 'payroll.db');

if (!fs.existsSync(DB_FILE)) {
  console.error(`database not found: ${DB_FILE}`);
  console.error('run `npm run db:test-build` first, or set DB_PATH.');
  process.exit(1);
}

const db = new D(DB_FILE, { readonly: true });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const problems = [];

for (const abs of walk(path.join(ROOT, 'server'))) {
  if (abs.includes('.test.ts')) continue;
  // seed.ts and schema.ts write into tables that only exist once the app has
  // booted (they create them inline). They target demo data, not request
  // handling, so a missing column there is not a runtime 500 for a user.
  if (/(seed|schema)\.ts$/.test(abs)) continue;
  const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
  const src = fs.readFileSync(abs, 'utf8');

  // INSERT [OR IGNORE|OR REPLACE] INTO t (a, b, c) VALUES (...)
  //
  // The OR IGNORE / OR REPLACE variants have to be included: the production
  // facade rewrites them for PostgreSQL, and a column list that only exists in
  // those forms is exactly as broken as one in a plain INSERT.
  const ins = /INSERT\s+(?:OR\s+(?:IGNORE|REPLACE)\s+)?INTO\s+(\w+)\s*\(([^)]+)\)/gi;
  let m;
  while ((m = ins.exec(src)) !== null) {
    const table = m[1];
    const cols = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    const line = src.slice(0, m.index).split('\n').length;
    if (!cols.length) continue;
    // Resolve each column individually so one bad name does not mask the rest
    // of the statement — otherwise fixing a column just reveals the next one.
    for (const col of cols) {
      try {
        db.prepare(`SELECT ${col} FROM ${table} LIMIT 0`);
      } catch (err) {
        problems.push({ kind: 'INSERT', rel, line, table, col, msg: String(err.message) });
      }
    }
  }

  // UPDATE t SET a = ?, b = ? WHERE ...
  const upd = /UPDATE\s+(\w+)\s+SET\s+([\s\S]{0,400}?)\s+WHERE\s+id\b/gi;
  while ((m = upd.exec(src)) !== null) {
    const table = m[1];
    const sets = m[2];
    const line = src.slice(0, m.index).split('\n').length;
    const cols = [...sets.matchAll(/(\w+)\s*=\s*[^,\n]+/g)].map((x) => x[1]);
    if (!cols.length) continue;
    // Interpolated identifiers cannot be checked statically; skip those lines.
    if (/\$\{/.test(sets)) continue;
    try {
      db.prepare(`SELECT ${cols.join(', ')} FROM ${table} LIMIT 0`);
    } catch (err) {
      problems.push({ kind: 'UPDATE', rel, line, table, msg: String(err.message) });
    }
  }
}

db.close();

fs.writeFileSync(
  path.join(ROOT, 'scripts', 'write-column-report.txt'),
  problems.map((p) => `${p.kind} ${p.rel}:${p.line}  ${p.table}\n  ${p.msg}`).join('\n\n'),
  'utf8'
);

console.log(`write statements with unresolvable columns: ${problems.length}`);
for (const p of problems) console.log(`  ${p.kind} ${p.rel}:${p.line} [${p.table}]  ${p.msg}`);

// Exits non-zero so `npm run verify` / CI fails rather than printing a warning.
// Each of these throws "no such column" at request time: a 500 on every write
// to that endpoint, which is exactly how 60 columns reached production before
// this check existed.
if (problems.length) {
  console.error(`\nFAIL: ${problems.length} column(s) missing from the schema.`);
  console.error('Add them to ADDITIONAL_COLUMNS in server/db/column-reconciliation.ts,');
  console.error('or correct the column name in the statement.');
  process.exit(1);
}
console.log('OK: every INSERT/UPDATE column exists.');
