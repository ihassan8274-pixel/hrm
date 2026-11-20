/**
 * Translates the application's SQL into PostgreSQL.
 *
 * The application was written against SQLite, so the queries carry SQLite
 * conventions that PostgreSQL does not accept. This module holds every
 * translation the server relies on, in one place, with no database connection
 * attached — so the behaviour can be unit-tested and reused by the schema
 * gates (`npm run check:pg-prepare`) instead of being re-implemented there.
 *
 * The translations:
 *   - `?` becomes `$1`, `$2`, … (a named call passes a single object, and
 *     `@name` becomes `$n` in that case)
 *   - `? IS NULL` becomes `$n::text`, because PostgreSQL cannot infer the
 *     type of a parameter used only in an IS NULL test (42P18)
 *   - `INSERT OR IGNORE` becomes `INSERT … ON CONFLICT DO NOTHING`
 *   - `INSERT OR REPLACE` becomes `INSERT … ON CONFLICT (key) DO UPDATE` for
 *     the `settings` table, and a plain `INSERT` everywhere else — the
 *     replacement is only meaningful where the table has a unique key
 */

/** Rewrites `?` / `@name` placeholders into PostgreSQL's `$n` form. */
export function parameterize(
  sql: string,
  params: unknown[] = [],
): { sql: string; params: unknown[] } {
  let output = "";
  let index = 0;
  const namedValues: unknown[] = [];
  const namedIndexes = new Map<string, number>();
  const namedParams =
    params.length === 1 &&
    params[0] !== null &&
    typeof params[0] === "object" &&
    !Array.isArray(params[0])
      ? (params[0] as Record<string, unknown>)
      : null;
  let state: "code" | "single" | "double" | "line" | "block" = "code";
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const next = sql[i + 1];
    if (state === "single") {
      output += char;
      if (char === "'" && next === "'") output += sql[++i];
      else if (char === "'") state = "code";
    } else if (state === "double") {
      output += char;
      if (char === '"' && next === '"') output += sql[++i];
      else if (char === '"') state = "code";
    } else if (state === "line") {
      output += char;
      if (char === "-" && next === "-") {
        output += sql[++i];
        state = "line";
      }
    } else if (state === "block") {
      output += char;
      if (char === "/" && next === "*") {
        output += sql[++i];
        state = "block";
      }
    } else if (state === "code") {
      if (char === "'") {
        output += char;
        state = "single";
      } else if (char === '"') {
        output += char;
        state = "double";
      } else if (char === "-" && next === "-") {
        output += char + sql[++i];
        state = "line";
      } else if (char === "/" && next === "*") {
        output += char + sql[++i];
        state = "block";
      } else if (char === "?" && !namedParams) {
        // PostgreSQL cannot infer the type of a parameter that is only used in
        // an IS NULL test, and rejects it with 42P18. The pattern is common in
        // the range filters ("? IS NULL OR entity_id = ?"), so the parameter is
        // cast to text: it is used in the null test only, where the type
        // carries no meaning.
        const rest = sql.slice(i + 1);
        const isNullTest = /^\s*IS\s+(NOT\s+)?NULL\b/i.test(rest);
        output += `$${++index}${isNullTest ? "::text" : ""}`;
      } else if (namedParams && char === "@" && /[A-Za-z_]/.test(next || "")) {
        let end = i + 1;
        while (/[A-Za-z0-9_]/.test(sql[end] || "")) end++;
        const name = sql.slice(i + 1, end);
        if (!Object.prototype.hasOwnProperty.call(namedParams, name)) {
          throw new Error(`Missing SQL parameter: ${name}`);
        }
        if (!namedIndexes.has(name)) {
          namedIndexes.set(name, namedValues.length + 1);
          namedValues.push(namedParams[name]);
        }
        output += `$${namedIndexes.get(name)}`;
        i = end - 1;
      } else {
        output += char;
      }
    } else {
      output += char;
    }
  }
  return { sql: output, params: namedParams ? namedValues : params };
}

/** Tables that carry no generated `id` and must not get a RETURNING clause. */
export const NO_ID_PRIMARY_KEY_TABLES = new Set(["countries", "schema_migrations", "settings"]);

/**
 * Rewrites the SQLite-flavoured statement forms into PostgreSQL.
 *
 * `returningId` adds `RETURNING id` to an INSERT so the caller receives the
 * new row's identifier — the SQLite build took it from `lastInsertRowid`.
 */
export function toPostgresStatement(sql: string, returningId = false): string {
  let normalized = sql.trim().replace(/;\s*$/, "");
  const ignore = /^INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(normalized);
  const replace = /^INSERT\s+OR\s+REPLACE\s+INTO\s+/i.test(normalized);
  normalized = normalized.replace(/^INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO\s+/i, "INSERT INTO ");

  // A replace is only expressible where the table has a unique key to
  // conflict on. `settings` is keyed by `key`; anywhere else the statement
  // degrades to a plain INSERT, which appends a row instead of replacing one.
  if (replace && /^INSERT\s+INTO\s+settings\b/i.test(normalized)) {
    normalized += " ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value";
  }
  if (ignore) normalized += " ON CONFLICT DO NOTHING";

  if (returningId && /^INSERT\s+INTO\s+/i.test(normalized)) {
    const table = normalized.match(/^INSERT\s+INTO\s+(?:"([^"]+)"|([a-z_][a-z0-9_]*))/i)?.slice(1).find(Boolean);
    if (table && !NO_ID_PRIMARY_KEY_TABLES.has(table.toLowerCase()) && !/\bRETURNING\b/i.test(normalized)) {
      normalized += " RETURNING id";
    }
  }
  return normalized;
}
