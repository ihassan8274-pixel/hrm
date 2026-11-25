/**
 * Creates the throwaway accounts used by the 50-user load test.
 *
 * This runs only against PAYROLL_ENV_FILE (scripts/.build/test.env), i.e. the
 * disposable PostgreSQL container on port 55433. It never reads the project's
 * .env and therefore cannot touch the production database.
 *
 *   npx tsx scripts/seed-load-users.ts --users=50
 */
import "./test-env";
import db, { closePostgresPool } from "../server/config/postgres";
import { hashPasswordSync } from "../server/lib/password";

function arg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : fallback;
}

const USERS = Number(arg("users", "50"));
const PREFIX = "load_user_";
// Throwaway credential for the disposable test schema only.
const PASSWORD = "LoadTest@2026";

async function main() {
  const employees = (await db
    .prepare("SELECT id, entity_id FROM employees ORDER BY id LIMIT ?")
    .all(USERS)) as any[];
  if (employees.length !== USERS) {
    throw new Error(`Need ${USERS} employees, found ${employees.length} — run gen:test-data first.`);
  }

  const names = Array.from({ length: USERS }, (_, i) => `${PREFIX}${String(i + 1).padStart(2, "0")}`);
  await db.prepare(`DELETE FROM users WHERE username LIKE ?`).run(`${PREFIX}%`);

  const hash = hashPasswordSync(PASSWORD);
  for (let i = 0; i < USERS; i++) {
    await db
      .prepare(
        `INSERT INTO users (username, password_hash, role, entity_id, employee_id, status, must_change_password)
         VALUES (?, ?, 'employee_ess', ?, ?, 'active', 0)`,
      )
      .run(names[i], hash, employees[i].entity_id, employees[i].id);
  }

  const count = (await db.prepare("SELECT COUNT(*) AS c FROM users WHERE username LIKE ?").get(`${PREFIX}%`)) as any;
  console.log(JSON.stringify({ created: count.c, username_pattern: `${PREFIX}NN`, password: PASSWORD, employees: employees.map((e) => e.id) }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePostgresPool();
  });
