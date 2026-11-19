/**
 * Applies the schema reconciliation to a database file.
 *
 * build-test-db.cjs runs this to replay what the server does at boot, so the
 * drift checks resolve columns against the same schema production has.
 *
 * Only the definition maps are imported — never server/db/migrate.ts, which
 * would open the real payroll.db through ../config/database.
 */
import path from 'path';
import Database from 'better-sqlite3';
import {
  COLUMN_RECONCILIATION,
  ADDITIONAL_COLUMNS,
  CREATED_TABLE_COLUMNS,
} from '../server/db/column-reconciliation';
import { createMissingTablesForTest } from '../server/db/column-reconciliation';

const target = process.argv[2];
if (!target) {
  console.error('usage: apply-reconciliation-to-db.ts <db-path>');
  process.exit(1);
}

const db = new Database(path.resolve(target));

let created = 0;
let added = 0;

// Same CREATE statements the server runs on boot.
if (typeof createMissingTablesForTest === 'function') {
  created = createMissingTablesForTest(db);
}

const defs: Record<string, Record<string, string>> = {};
for (const src of [COLUMN_RECONCILIATION, ADDITIONAL_COLUMNS, CREATED_TABLE_COLUMNS]) {
  for (const [table, cols] of Object.entries(src || {})) {
    if (!cols || Object.keys(cols).length === 0) continue;
    defs[table] = { ...(defs[table] || {}), ...(cols as Record<string, string>) };
  }
}

for (const [table, cols] of Object.entries(defs)) {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(table);
  if (!exists) continue;
  const have = new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map((c) => c.name)
  );
  for (const [col, definition] of Object.entries(cols)) {
    if (have.has(col)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${definition}`);
    added++;
  }
}

db.close();
console.log(`  reconciled: ${created} tables created, ${added} columns added`);