/**
 * Emits the ADDITIONAL_COLUMNS block for column-reconciliation.ts from the
 * live scan, so the fix list is derived from the database rather than typed
 * by hand (which is how drifts get reintroduced).
 *
 * Type is inferred from the column name so the DDL matches the intent:
 *   *_date / date / expiry* / start_date → TEXT (SQLite has no DATE type)
 *   amount / salary / *_premium / rate    → REAL
 *   is_* / *_days / count                → INTEGER
 *   everything else                      → TEXT
 */
const fs = require('fs');
const path = require('path');
const D = require('better-sqlite3');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const db = new D(path.join(ROOT, 'payroll.db'), { readonly: true });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const infer = (col) => {
  if (/^(is_|has_)/.test(col) || /(_days|_count|_id|_index|_order|_month|_year|_cap|_hours)$/.test(col)) {
    return 'INTEGER DEFAULT 0';
  }
  if (/(amount|salary|premium|_rate|_cost|balance|compensation)/.test(col)) return 'REAL DEFAULT 0';
  if (/_date$|^date$|expiry|start_date|end_date|_at$|_on$/.test(col)) return 'TEXT';
  return 'TEXT';
};

const byTable = new Map();

for (const abs of walk(path.join(ROOT, 'server'))) {
  if (abs.includes('.test.ts')) continue;
  const src = fs.readFileSync(abs, 'utf8');
  const ins = /INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)/gi;
  let m;
  while ((m = ins.exec(src)) !== null) {
    const table = m[1];
    for (const raw of m[2].split(',')) {
      const col = raw.trim();
      if (!col || /^[a-z_]+$/i.test(col) === false) continue;
      try {
        db.prepare(`SELECT ${col} FROM ${table} LIMIT 0`);
      } catch {
        if (!byTable.has(table)) byTable.set(table, new Set());
        byTable.get(table).add(col);
      }
    }
  }
}
db.close();

const lines = [];
for (const [table, cols] of [...byTable].sort()) {
  lines.push(`  ${table}: {`);
  for (const c of [...cols].sort()) lines.push(`    ${c}: '${infer(c)}',`);
  lines.push('  },');
}

const out = lines.join('\n');
fs.writeFileSync(path.join(ROOT, 'scripts', 'generated-additional-columns.txt'), out, 'utf8');
console.log(`tables: ${byTable.size}`);
console.log(`columns: ${[...byTable.values()].reduce((n, s) => n + s.size, 0)}`);
console.log('written to scripts/generated-additional-columns.txt');