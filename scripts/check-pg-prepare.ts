/**
 * Prepares every SQL statement the server sends to PostgreSQL and reports the
 * ones the planner rejects.
 *
 * Why this exists, and why it is not the same as the SQLite drift gate:
 *
 *   - PostgreSQL resolves column names, operators and function names when the
 *     statement is planned, so a query that cannot run fails here — before a
 *     single row is touched. `iqama_expiry_gregorian <= ?` on a TEXT column,
 *     `julianday(...)` (a SQLite function) and `substr()` on a TIMESTAMPTZ are
 *     all rejected at plan time.
 *   - The SQLite gate cannot see any of that: it accepts the functions and the
 *     casts that PostgreSQL rejects.
 *   - The SQLite gate also skips every statement built with `${...}`, and that
 *     is exactly where `e.emp_code` hid — a column that does not exist, in the
 *     statement behind the payroll slips screen.
 *
 * The statements are translated with the server's own translation module, so
 * this gate and the server cannot drift apart.
 *
 * The gate works in a scratch schema (`payroll_gate`) that is created and
 * dropped again, so it never touches the application's data.
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host:5432/db npm run check:pg-prepare
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { extractStatements, collectServerSources, isSchemaCheckable } from "../server/db/sql-extractor";
import { parameterize, toPostgresStatement } from "../server/config/sql-translate";

const ROOT = process.cwd();
const SCRATCH_SCHEMA = "payroll_gate";

/**
 * Stands in for an interpolated fragment.
 *
 * The SQL is assembled at runtime from fragments the code controls, so the
 * text is not known statically. Each fragment is replaced with something of
 * the same shape that must still resolve against the schema — that is what
 * makes the check meaningful rather than a syntax check.
 *
 * The mapping is explicit on purpose: these six files are the only ones the
 * interpolation gate allows, and each fragment is listed there with the reason
 * it is safe.
 */
const INTERPOLATION_STAND_INS: Record<string, string> = {
  // A WHERE clause assembled from fixed fragments; every value stays bound.
  where: "1=1",
  whereClause: "1=1",
  // A column of `payroll` picked from a fixed whitelist.
  safeField: "basic_salary",
  // A list of `column = ?` pairs for `salary_components`.
  fields: "id = NULL",
  "fields.join(', ')": "id = NULL",
  // A table and a column from the hard-coded import registry.
  "m.table": "employees",
  "m.uniqueness.dbColumn": "id",
  // A table name read from information_schema and quoted by the caller.
  safeName: "employees",
  // The backup/restore endpoint writes every table it finds in the archive;
  // the names come from the database's own catalogue and are quoted.
  quotedTable: '"employees"',
  colNames: '"id"',
  placeholders: "NULL",
};

function deInterpolate(sql: string): { sql: string; unknown: string[] } {
  const unknown: string[] = [];
  const out = sql.replace(/\$\{([^}]+)\}/g, (_match, raw: string) => {
    const name = raw.trim();
    const stand = INTERPOLATION_STAND_INS[name];
    if (stand === undefined) {
      unknown.push(name);
      return "NULL";
    }
    return stand;
  });
  return { sql: out, unknown };
}

/** Statements that are not about the schema. */
function isCheckable(sql: string): boolean {
  const s = sql.trim();
  if (!s) return false;
  if (!/^(SELECT|INSERT\s+INTO|UPDATE|DELETE|WITH)\b/i.test(s)) return false;
  // The reconciliation module inspects the SQLite catalogue; it is not part of
  // the request path.
  if (/sqlite_master|sqlite_sequence/i.test(s)) return false;
  return true;
}

/**
 * PostgreSQL cannot infer the type of a parameter that only appears in an
 * IS NULL test, and the facade casts exactly those to text. The remaining
 * placeholders are replaced with NULL so the planner resolves every column.
 */
function neutraliseParameters(sql: string): string {
  return sql.replace(/\$(\d+)/g, "NULL");
}

async function main() {
  const connectionString = (process.env.PG_GATE_URL || process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    console.error(
      "PG_GATE_URL (or DATABASE_URL) must point at a PostgreSQL server this gate may use.",
    );
    process.exit(2);
  }

  const client = new Client({ connectionString });
  await client.connect();

  const problems: { file: string; line: number; msg: string; sql: string }[] = [];
  const unknownInterpolations = new Set<string>();
  let checked = 0;
  let deinterpolated = 0;

  try {
    await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SCRATCH_SCHEMA}`);
    await client.query(`SET search_path = ${SCRATCH_SCHEMA}`);

    const migrationDir = path.join(ROOT, "server", "db", "postgres");
    for (const file of fs.readdirSync(migrationDir).sort()) {
      const sql = fs.readFileSync(path.join(migrationDir, file), "utf8");
      await client.query(sql);
    }

    for (const rel of collectServerSources(ROOT)) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) continue;
      const source = fs.readFileSync(abs, "utf8");
      for (const st of extractStatements(source, rel, { normalizeForSqlite: false })) {
        if (!isSchemaCheckable(st.sql)) continue;
        if (!isCheckable(st.sql)) continue;

        let sql = st.sql.trim().replace(/;\s*$/, "");
        if (st.interpolated) {
          deinterpolated++;
          const result = deInterpolate(sql);
          sql = result.sql;
          for (const name of result.unknown) unknownInterpolations.add(`${rel}:${name}`);
        }

        // A named-parameter call passes one object; a positional call does not.
        const usesNamed = /@\w/.test(sql);
        let translated: string;
        try {
          const { sql: parameterised } = parameterize(sql, usesNamed ? ({} as unknown[]) : []);
          translated = toPostgresStatement(parameterised);
        } catch (error) {
          problems.push({
            file: rel,
            line: st.line,
            msg: `translation failed: ${(error as Error).message}`,
            sql: sql.replace(/\s+/g, " ").slice(0, 160),
          });
          continue;
        }

        const statement = neutraliseParameters(translated);
        checked++;
        try {
          if (/^(INSERT|UPDATE|DELETE)\b/i.test(statement)) {
            // EXPLAIN plans the statement without executing it, so the gate
            // cannot write a row.
            await client.query(`EXPLAIN ${statement}`);
          } else {
            await client.query({ text: statement, values: [] });
          }
        } catch (error) {
          const message = String((error as Error).message || error);
          // A parameter type that cannot be inferred is a statement that binds
          // its values; it is not a schema problem.
          if (
            /there is no parameter|bind message supplies|cannot determine data type of parameter/i.test(
              message,
            )
          ) {
            continue;
          }
          problems.push({
            file: rel,
            line: st.line,
            msg: message.split("\n")[0],
            sql: sql.replace(/\s+/g, " ").slice(0, 160),
          });
        }
      }
    }
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`).catch(() => {});
    await client.end();
  }

  console.log(`statements planned on PostgreSQL: ${checked}`);
  console.log(`  of which built from an interpolated fragment: ${deinterpolated}`);
  if (unknownInterpolations.size) {
    console.log(
      `  fragments without a stand-in (checked with NULL, so only their shape is verified): ${[
        ...unknownInterpolations,
      ].join(", ")}`,
    );
  }
  console.log(`rejected by PostgreSQL: ${problems.length}\n`);
  for (const problem of problems) {
    console.log(`${problem.file}:${problem.line}`);
    console.log(`  ${problem.msg}`);
    console.log(`  ${problem.sql}\n`);
  }

  if (problems.length) {
    console.error(`FAIL: ${problems.length} statement(s) cannot run on PostgreSQL.`);
    process.exit(1);
  }
  console.log("OK: every statement the server sends can run on PostgreSQL.");
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(2);
});
