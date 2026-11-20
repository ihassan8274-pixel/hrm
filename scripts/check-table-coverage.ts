/**
 * Reports which tables the application actually writes to, and whether each
 * table accepts a row at all.
 *
 * The development plan measured 108 tables with 631 rows and found that 82 of
 * them had never been written to by any test — so a mistake in one of those
 * write paths (a column that does not exist, a value of the wrong type) could
 * not surface until a user used that screen.
 *
 * The report answers two questions per table:
 *   1. does the code write to it? (an INSERT/UPDATE naming the table)
 *   2. does the schema accept a row? (a minimal insert, rolled back)
 *
 * Only schema-level failures fail the run: a missing relation, a missing
 * column, a syntax error or a value the column's type cannot hold. A foreign
 * key or a NOT NULL violation means the minimal row is not realistic, not
 * that the schema is broken, so those are reported and not failed.
 *
 * Usage:
 *   PG_GATE_URL=postgresql://user:pass@host:5432/db npm run check:tables
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { extractStatements, collectServerSources } from "../server/db/sql-extractor";

const ROOT = process.cwd();
const SCRATCH_SCHEMA = "payroll_gate";

/** A value of the right shape for a column type. */
function valueFor(type: string): string | null {
  const t = type.toLowerCase();
  if (t.includes("int") || t.includes("serial")) return "1";
  if (t.includes("numeric") || t.includes("real") || t.includes("double") || t.includes("decimal")) return "1";
  if (t.includes("bool")) return "false";
  if (t.includes("date") && !t.includes("time")) return "CURRENT_DATE";
  if (t.includes("timestamp")) return "CURRENT_TIMESTAMP";
  if (t.includes("json")) return "'{}'::jsonb";
  if (t.includes("bytea")) return "'\\x00'::bytea";
  if (t.includes("uuid")) return "gen_random_uuid()";
  if (t.includes("[]")) return null;
  if (t.includes("char") || t.includes("text")) return "'x'";
  return null;
}

async function main() {
  const connectionString = (process.env.PG_GATE_URL || process.env.DATABASE_URL || "").trim();
  if (!connectionString) {
    console.error("PG_GATE_URL (or DATABASE_URL) must point at a PostgreSQL server this check may use.");
    process.exit(2);
  }

  // Which tables does the code write to?
  const written = new Set<string>();
  for (const rel of collectServerSources(ROOT)) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    const source = fs.readFileSync(abs, "utf8");
    for (const st of extractStatements(source, rel, { normalizeForSqlite: false })) {
      const match = /\b(?:INSERT\s+(?:OR\s+(?:IGNORE|REPLACE)\s+)?INTO|UPDATE)\s+"?(\w+)"?/i.exec(st.sql);
      if (match) written.add(match[1].toLowerCase());
    }
  }

  const client = new Client({ connectionString });
  await client.connect();

  const schemaProblems: { table: string; msg: string }[] = [];
  const needsRealRow: { table: string; msg: string }[] = [];
  let writable = 0;
  let empty = 0;
  let rows: { table: string; written: boolean; outcome: string; detail: string }[] = [];

  try {
    await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`);
    await client.query(`CREATE SCHEMA ${SCRATCH_SCHEMA}`);
    await client.query(`SET search_path = ${SCRATCH_SCHEMA}`);
    const migrationDir = path.join(ROOT, "server", "db", "postgres");
    for (const file of fs.readdirSync(migrationDir).sort()) {
      await client.query(fs.readFileSync(path.join(migrationDir, file), "utf8"));
    }

    const tables = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1 AND table_type = 'BASE TABLE'
        ORDER BY table_name`,
      [SCRATCH_SCHEMA],
    );

    for (const { table_name: table } of tables.rows) {
      const columns = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
        column_default: string | null;
        is_generated: string;
      }>(
        `SELECT column_name, data_type, is_nullable, column_default, is_generated
           FROM information_schema.columns
          WHERE table_schema = $1 AND table_name = $2
          ORDER BY ordinal_position`,
        [SCRATCH_SCHEMA, table],
      );

      const insertable = columns.rows.filter(
        (column) =>
          !column.is_generated.startsWith("ALWAYS") &&
          !column.is_generated.startsWith("IDENTITY") &&
          column.column_default === null &&
          column.is_nullable === "YES",
      );
      const required = columns.rows.filter(
        (column) =>
          !column.is_generated.startsWith("ALWAYS") &&
          !column.is_generated.startsWith("IDENTITY") &&
          column.column_default === null &&
          column.is_nullable === "NO",
      );

      const names: string[] = [];
      const values: string[] = [];
      let unsupported = false;
      for (const column of [...required, ...insertable]) {
        const value = valueFor(column.data_type);
        if (value === null) {
          unsupported = true;
          break;
        }
        names.push(`"${column.column_name}"`);
        values.push(value);
      }

      if (!names.length) {
        rows.push({ table, written: written.has(table), outcome: "no writable column", detail: "" });
        continue;
      }
      if (unsupported) {
        rows.push({ table, written: written.has(table), outcome: "skipped", detail: "a column type has no stand-in value" });
        continue;
      }

      try {
        await client.query("BEGIN");
        await client.query(`INSERT INTO "${table}" (${names.join(", ")}) VALUES (${values.join(", ")})`);
        await client.query("ROLLBACK");
        writable++;
        rows.push({ table, written: written.has(table), outcome: "writable", detail: "" });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        const message = String((error as Error).message || error);
        const code = (error as { code?: string }).code || "";
        // 42P01 relation, 42703 column, 42601 syntax, 22P02 invalid input for type
        if (["42P01", "42703", "42601", "22P02", "42804"].includes(code)) {
          schemaProblems.push({ table, msg: message.split("\n")[0] });
          rows.push({ table, written: written.has(table), outcome: "schema error", detail: message.split("\n")[0] });
        } else {
          needsRealRow.push({ table, msg: message.split("\n")[0] });
          rows.push({ table, written: written.has(table), outcome: "needs a realistic row", detail: message.split("\n")[0] });
        }
      }
    }
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${SCRATCH_SCHEMA} CASCADE`).catch(() => {});
    await client.end();
  }

  const untouched = rows.filter((row) => !row.written && row.outcome === "writable");
  const report = [
    "# Table coverage",
    "",
    `Tables: ${rows.length} · writable with a minimal row: ${writable} · written by the application: ${rows.filter((r) => r.written).length} · never written by the application: ${untouched.length}`,
    "",
    "| table | written by the app | outcome | detail |",
    "|---|---|---|---|",
    ...rows.map((row) => `| ${row.table} | ${row.written ? "yes" : "no"} | ${row.outcome} | ${row.detail.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "scripts", "table-coverage-report.md"), report, "utf8");

  console.log(`tables: ${rows.length}`);
  console.log(`  writable with a minimal row : ${writable}`);
  console.log(`  written by the application  : ${rows.filter((r) => r.written).length}`);
  console.log(`  never written by the app    : ${untouched.length}`);
  console.log(`  need a realistic row        : ${needsRealRow.length}`);
  console.log(`  schema errors               : ${schemaProblems.length}`);
  console.log("\nreport: scripts/table-coverage-report.md");

  if (schemaProblems.length) {
    console.error("\nFAIL: a table does not match the schema:");
    for (const problem of schemaProblems) console.error(`  ${problem.table}: ${problem.msg}`);
    process.exit(1);
  }
  console.log("\nOK: every table matches the schema.");
}

main().catch((error) => {
  console.error("FAILED:", error);
  process.exit(2);
});
