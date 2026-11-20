import fs from "node:fs";
import path from "node:path";

/**
 * The environment file the integration tests run under.
 *
 * It points the application at the throwaway database from
 * docker-compose.test.yml, in the schema the integration tests own.
 *
 * The file is written on demand rather than committed: it holds the
 * credentials of a local throwaway database, and the port it points at is
 * configurable.
 */
export const TEST_ENV_PATH = path.resolve(process.cwd(), "scripts", ".build", "test.env");

export const TEST_ENV_CONTENTS = [
  "PGSCHEMA=payroll_test",
  "DATABASE_URL=postgresql://payroll_app:testpass123@127.0.0.1:55433/payroll_test",
  "PG_POOL_MAX=4",
  "NODE_ENV=test",
  "JWT_SECRET=integration-test-secret-not-used-in-production",
  "CORS_ORIGINS=http://localhost:13000",
  "",
].join("\n");

/**
 * Writes the file if it is not there.
 *
 * It has to be written on demand: the throwaway SQLite database that the
 * ordinary test run builds lives in the same directory and wipes it, so a
 * committed or manually created file would disappear between runs. Writing it
 * here means the integration suite always finds the environment it needs.
 */
export function ensureTestEnvFile(target: string = TEST_ENV_PATH): string {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, TEST_ENV_CONTENTS, "utf8");
  }
  return target;
}
