/**
 * Extracts every SQL statement passed to db.prepare() / db.exec() in the
 * server sources, so the schema-drift test can have SQLite validate them.
 *
 * Only template literals that are *directly* the call argument are considered.
 * That precision matters: an earlier regex over all quoted strings produced 307
 * false positives (aliases like employee_name, table names in JOINs, plain
 * TypeScript). Statements containing ${...} interpolation are reported
 * separately because their SQL cannot be resolved statically.
 */

import fs from "node:fs";
import path from "node:path";

export interface ExtractedStatement {
  file: string;
  line: number;
  sql: string;
  interpolated: boolean;
}

/**
 * How the extracted SQL text is normalised.
 *
 * The default cleanup targets SQLite: it turns the doubled quotes SQLite
 * accepts into single ones and rewrites a double-quoted literal into a
 * single-quoted one. PostgreSQL reads `"x"` as an identifier, so the cleanup
 * has to be switched off there — and the `''` → `'` replacement breaks an
 * empty string literal, which is why the PostgreSQL gate asks for the raw
 * text.
 */
export interface ExtractOptions {
  /** Rewrites the SQL for the SQLite dialect. Defaults to true. */
  normalizeForSqlite?: boolean;
}

/** Recursively collect .ts files, skipping tests and the migrations folder. */
function collectFiles(dir: string, base: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, base, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      out.push(path.relative(base, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

export function collectServerSources(base = process.cwd()): string[] {
  return [
    ...collectFiles('server/routes', base),
    ...collectFiles('server/db', base),
    ...collectFiles('server/lib', base),
  ];
}

/**
 * Scans for `db.prepare(` / `db.exec(` followed by a backtick template literal,
 * matching the closing backtick. Tracks line numbers by counting newlines.
 *
 * The facade's direct entry points — `queryOne`, `queryAll` and `execute` —
 * are matched as well: they are used directly in a few modules, and a statement
 * that only goes through them would otherwise never be checked.
 */
export function extractStatements(
  source: string,
  file: string,
  options: ExtractOptions = {},
): ExtractedStatement[] {
  const normalizeForSqlite = options.normalizeForSqlite !== false;
  const results: ExtractedStatement[] = [];
  // Both forms occur in this codebase: backtick template literals (multi-line
  // SQL) and single-quoted strings (short one-liners). Matching only backticks
  // missed queries like `SELECT * FROM medical_policies ORDER BY expiry_date`.
  const callRe = /\b(?:db\.(?:prepare|exec)|queryOne|queryAll|execute)\s*\(\s*([`'"])/g;
  let match: RegExpExecArray | null;

  while ((match = callRe.exec(source)) !== null) {
    const quote = match[1];
    const openIdx = match.index + match[0].length - 1;
    const isTemplate = quote === '`';
    const isDouble = quote === '"';
    let i = openIdx + 1;
    let sql = '';
    while (i < source.length) {
      const ch = source[i];
      if (ch === '\\') {
        sql += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) break;
      // A single-quoted SQL literal ends at the next quote; bail out on a
      // newline so a stray apostrophe cannot swallow the rest of the file.
      if (!isTemplate && ch === '\n') break;
      sql += ch;
      i++;
    }
    const line = source.slice(0, match.index).split('\n').length;
    // For quoted forms, normalise the doubled quotes SQLite accepts.
    // Also convert double-quoted string literals to single quotes: SQLite
    // treats "x" as an identifier first, which produces misleading
    // `no such column: "active"` errors that mask the real drift.
    const cleaned = isTemplate
      ? sql
      : normalizeForSqlite
        ? sql
            .replace(/''/g, "'")
            .replace(/\\'/g, "'")
            .replace(/"([^"]*)"/g, "'$1'")
        : sql;
    results.push({
      file,
      line,
      sql: isDouble ? cleaned.replace(/"/g, '') : cleaned,
      interpolated: isTemplate && /\$\{/.test(sql),
    });
    callRe.lastIndex = i;
  }

  return results;
}

/** DDL/DML we cannot meaningfully prepare against the schema for column checks. */
export function isSchemaCheckable(sql: string): boolean {
  const s = sql.trim();
  if (!s) return false;
  // SELECT reveals columns the app reads; INSERT/UPDATE reveal columns it
  // writes. Both fail the same way at runtime ("no such column"), so both are
  // checked. CREATE/DELETE are skipped: they carry no column list.
  return /^(SELECT|INSERT\s+INTO|UPDATE)\b/i.test(s);
}