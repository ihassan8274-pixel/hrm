import fs from "node:fs";
import path from "node:path";
import { ensurePostgresSchema, execute, executeScript, queryAll, transaction } from "../config/postgres";

const migrationsDirectory = path.join(process.cwd(), "server", "db", "postgres");

export async function runPostgresMigrations(): Promise<void> {
  await ensurePostgresSchema();
  await executeScript(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = fs.readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .sort((a, b) => Number(a.split("_")[0]) - Number(b.split("_")[0]));
  const appliedRows = await queryAll<{ version: number }>("SELECT version FROM schema_migrations");
  const applied = new Set(appliedRows.map((row) => Number(row.version)));

  for (const file of files) {
    const version = Number(file.split("_")[0]);
    if (applied.has(version)) continue;
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
    await transaction(async () => {
      await executeScript(sql);
      await execute("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", version, file);
    })();
    console.log(`[postgres:migrate] Applied ${file}`);
  }
}

export async function getPostgresMigrationStatus() {
  const files = fs.readdirSync(migrationsDirectory)
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .sort();
  const applied = await queryAll<{ version: number; name: string; applied_at: string }>(
    "SELECT version, name, applied_at FROM schema_migrations ORDER BY version",
  );
  return { pending: files.filter((file) => !applied.some((row) => row.name === file)), applied };
}
