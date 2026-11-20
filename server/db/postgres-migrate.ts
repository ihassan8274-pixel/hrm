import fs from "node:fs";
import path from "node:path";
import { ensurePostgresSchema, execute, executeScript, queryAll, transaction } from "../config/postgres";
import { log } from "../lib/logger";

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
  const appliedRows = await queryAll<{ version: number; name: string }>(
    "SELECT version, name FROM schema_migrations",
  );
  const applied = new Set(appliedRows.map((row) => Number(row.version)));
  const appliedNames = new Map(appliedRows.map((row) => [Number(row.version), row.name]));

  // A migration is skipped when its version number is taken — and on an
  // existing database the numbers can already belong to an older migration
  // set. That is a silent no-op, so it is reported: the schema change of the
  // skipped file has to be verified by hand, or the file renumbered above the
  // highest applied version.
  const conflicts: string[] = [];

  for (const file of files) {
    const version = Number(file.split("_")[0]);
    if (applied.has(version)) {
      const recorded = appliedNames.get(version);
      if (recorded && recorded !== file) {
        conflicts.push(`${file} (version ${version} already applied as "${recorded}")`);
      }
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
    await transaction(async () => {
      await executeScript(sql);
      await execute("INSERT INTO schema_migrations (version, name) VALUES (?, ?)", version, file);
    })();
    log.info(`[postgres:migrate] Applied ${file}`);
  }

  if (conflicts.length > 0) {
    log.warn(
      `[postgres:migrate] ${conflicts.length} migration file(s) were skipped because their version number ` +
        `belongs to an older migration set: ${conflicts.join("; ")}. Check that the schema change of each ` +
        `skipped file is already present, or renumber it above the highest applied version.`,
    );
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
