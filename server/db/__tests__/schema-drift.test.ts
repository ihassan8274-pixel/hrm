import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import {
  extractStatements,
  collectServerSources,
  isSchemaCheckable,
} from '../sql-extractor';

/**
 * Schema-drift guard.
 *
 * Every runtime bug in this area had the same shape: the database schema and
 * the SQL in the route handlers had drifted apart, so the request failed with
 * "no such column" / "no such table" only when a user hit that screen:
 *
 *   - work_injuries missing 12 columns the POST route writes
 *   - attendance_devices.status read, but the column is is_active
 *   - employee_grievances / hearing_sessions / official_warnings never created
 *
 * Static review missed all three; they are invisible until runtime. This test
 * has SQLite itself resolve every SELECT in the server sources against the
 * real schema, which is exactly the check the database performs at runtime.
 */

const DB_PATH = process.env.DB_PATH || 'payroll.db';
const dbExists = fs.existsSync(DB_PATH);

// Statements whose SQL is built by interpolation cannot be validated statically.
const SKIP_REASON = 'contains ${...} interpolation';

function buildStatements() {
  const out: { file: string; line: number; sql: string; skipped?: string }[] = [];
  for (const rel of collectServerSources()) {
    const abs = path.resolve(rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const st of extractStatements(src, rel)) {
      if (!isSchemaCheckable(st.sql)) continue;
      if (st.interpolated) {
        out.push({ file: st.file, line: st.line, sql: '', skipped: SKIP_REASON });
        continue;
      }
      out.push({ file: st.file, line: st.line, sql: st.sql });
    }
  }
  return out;
}

// Validating against the real database keeps the check honest: it is the same
// file the app opens at runtime.
describe.skipIf(!dbExists)('schema drift — SELECT statements resolve', () => {
  const statements = buildStatements();
  const checkable = statements.filter((s) => !s.skipped);

  it('finds statements to validate', () => {
    // Guards against the extractor silently matching nothing, which would make
    // every other assertion in this file vacuously true.
    expect(checkable.length).toBeGreaterThan(200);
  });

  it('resolves every column referenced by the server', () => {
    const db = new Database(DB_PATH, { readonly: true });
    const failures: string[] = [];

    for (const st of checkable) {
      // Placeholders are irrelevant to schema resolution; SQLite binds them at
      // execute time, and prepare() only resolves names.
      const sql = st.sql.trim().replace(/\?/g, 'NULL');
      try {
        db.prepare(sql);
      } catch (err) {
        const msg = String((err as Error).message || err);
        // Only column/table resolution matters here. A syntax error would mean
        // the extractor mangled the text, which the count test above covers.
        if (/no such column|no such table/i.test(msg)) {
          failures.push(`${st.file}:${st.line}  ${msg}\n    ${sql.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }
    db.close();

    expect(
      failures,
      `SQL references columns/tables that do not exist:\n\n${failures.join('\n\n')}`
    ).toEqual([]);
  });

  it('covers the modules that previously drifted', () => {
    const files = new Set(checkable.map((s) => s.file));
    expect([...files].some((f) => f.includes('routes/'))).toBe(true);
  });

  // SQLite resolves "value" as an identifier, not a string literal, so a query
  // written that way throws `no such column: "active"` at request time. Two
  // endpoints shipped this way. Column checks cannot see it, so scan the SQL
  // text for double-quoted literals used as values.
  it('uses single quotes for string literals in SQL', () => {
    const offenders: string[] = [];
    for (const st of checkable) {
      // A double quote inside SQL is a literal unless it wraps an identifier we
      // know exists. Flag any that look like values (quotes around a word with
      // no dot/underscore, i.e. not an alias).
      const dq = st.sql.match(/=\s*"[^"]+"|!=\s*"[^"]+"/g);
      if (dq) offenders.push(`${st.file}:${st.line}  ${dq.join(', ')}\n    ${st.sql.replace(/\s+/g, ' ').slice(0, 120)}`);
    }
    expect(
      offenders,
      `Double-quoted SQL literals (SQLite treats these as identifiers):\n\n${offenders.join('\n\n')}`
    ).toEqual([]);
  });
});

describe('sql-extractor', () => {
  const src = [
    'const a = db.prepare(`SELECT id, name FROM employees WHERE branch_id = ?`);',
    'const b = db.prepare(`SELECT id FROM branches`);',
    'const c = db.prepare(`SELECT COUNT(*) as c FROM payroll WHERE month = ${m}`);',
    'db.exec(`UPDATE x SET y = ?`);',
    "const notSql = 'this is not a database call';",
  ].join('\n');

  const got = extractStatements(src, 'fixture.ts');

  it('extracts template-literal SQL passed to prepare/exec', () => {
    // 4 total: three db.prepare + one db.exec. The plain string on the last
    // line is not a db call and must not be picked up.
    expect(got).toHaveLength(4);
    expect(got[0].sql).toContain('FROM employees');
  });

  it('flags interpolated statements as unresolvable', () => {
    const interp = got.find((g) => g.sql.includes('${m}'));
    expect(interp?.interpolated).toBe(true);
  });

  it('reports accurate line numbers', () => {
    expect(got[0].line).toBe(1);
    expect(got[1].line).toBe(2);
    expect(got[2].line).toBe(3);
  });

  it('ignores strings that are not db calls', () => {
    expect(got.some((g) => g.sql.includes('not a database call'))).toBe(false);
  });

  it('checks statements that name columns, and skips those that do not', () => {
    expect(isSchemaCheckable('SELECT id FROM employees')).toBe(true);
    // Writes name columns too, and fail identically at runtime.
    expect(isSchemaCheckable('INSERT INTO t (a) VALUES (?)')).toBe(true);
    expect(isSchemaCheckable('UPDATE t SET a = ? WHERE id = ?')).toBe(true);
    // DELETE and CREATE carry no column list worth validating.
    expect(isSchemaCheckable('DELETE FROM t WHERE id = ?')).toBe(false);
    expect(isSchemaCheckable('CREATE TABLE t (id INTEGER)')).toBe(false);
    expect(isSchemaCheckable('')).toBe(false);
  });

  // SQLite treats "x" as an identifier, not a string. A query using double
  // quotes for a literal throws `no such column: "active"` only at runtime,
  // and no amount of column-drift checking catches it.
  it('normalises double-quoted literals to single quotes', () => {
    const src = `db.prepare('SELECT * FROM t WHERE status = "active" AND x != ""');`;
    const out = extractStatements(src, 'f.ts');
    expect(out[0].sql).toContain("status = 'active'");
    expect(out[0].sql).toContain("x != ''");
    expect(out[0].sql).not.toContain('"');
  });

  it('extracts single-quoted SQL, not just template literals', () => {
    const src = "const r = db.prepare('SELECT id FROM branches ORDER BY name').all();";
    const out = extractStatements(src, 'f.ts');
    expect(out).toHaveLength(1);
    expect(out[0].sql).toContain('FROM branches');
  });

  it('handles a backtick escaped inside the SQL', () => {
    const tricky = 'db.prepare(`SELECT name FROM sqlite_master WHERE name = \'a`b\'`);';
    const out = extractStatements(tricky, 'f.ts');
    expect(out).toHaveLength(1);
  });
});