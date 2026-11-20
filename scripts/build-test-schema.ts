/**
 * Builds a complete schema in the target PostgreSQL schema.
 *
 * The integration tests need the same structure the application runs against,
 * so this uses the application's own path rather than a fixture:
 *
 *   1. the PostgreSQL migration files (server/db/postgres/*.sql)
 *   2. the inline DDL of the modules that kept their schema in the route
 *      split (server/db/seed.ts)
 *
 * Both go through the same executeScript() the server uses, so the SQLite
 * spellings in that DDL are translated the same way they are at boot.
 *
 * The target schema is read from PGSCHEMA, the connection from DATABASE_URL.
 * A schema that already exists is dropped first, so a run always starts from
 * the same state.
 *
 *   PGSCHEMA=payroll_test \
 *   DATABASE_URL=postgresql://payroll_app:testpass123@127.0.0.1:55433/payroll_test \
 *   npx tsx scripts/build-test-schema.ts
 */
// Must come first: it chooses the environment file the application loads.
import "./test-env";
import { Client } from "pg";
import { runPostgresMigrations } from "../server/db/postgres-migrate";
import { seedExtendedModules } from "../server/db/seed";
import { closePostgresPool } from "../server/config/postgres";

const schema = (process.env.PGSCHEMA || "payroll_test").trim();
const connectionString = (process.env.DATABASE_URL || "").trim();

if (!connectionString) {
  console.error("DATABASE_URL must point at the test PostgreSQL server.");
  process.exit(1);
}
if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
  console.error("PGSCHEMA must be a simple PostgreSQL schema name.");
  process.exit(1);
}
if (schema === "payroll") {
  console.error("Refusing to rebuild the 'payroll' schema — that is the live one.");
  process.exit(1);
}

const admin = new Client({ connectionString });
await admin.connect();

// The pool inside the app connects with search_path set to the target schema,
// so the schema has to exist before anything else runs.
await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
await admin.query(`CREATE SCHEMA "${schema}"`);
await admin.end();

console.log(`schema ${schema}: dropped and recreated`);

await runPostgresMigrations();
console.log("migrations: applied");

await seedExtendedModules();
console.log("module DDL: applied");

await closePostgresPool();

const check = new Client({ connectionString });
await check.connect();
const tables = await check.query(
  `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = $1`,
  [schema],
);
const columns = await check.query(
  `SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema = $1`,
  [schema],
);
console.log(`schema ${schema}: ${tables.rows[0].n} tables, ${columns.rows[0].n} columns`);
await check.end();
