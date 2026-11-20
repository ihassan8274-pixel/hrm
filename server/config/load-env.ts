import dotenv from "dotenv";

/**
 * Loads the project's environment file.
 *
 * The project's own .env is authoritative: it overrides whatever the shell
 * happens to carry. That is deliberate — this machine keeps a DATABASE_URL
 * for a different project in the user environment, and a shell value that
 * silently wins over the file is how an application ends up pointed at the
 * wrong database.
 *
 * PAYROLL_ENV_FILE names a different file to load instead. It exists for the
 * integration tests, which need the whole application to run against the
 * throwaway schema: without it there is no way to point the server at
 * another database, because .env always wins. Unset, the behaviour is
 * exactly what it was.
 */
export function loadProjectEnv() {
  const override = process.env.PAYROLL_ENV_FILE?.trim();
  return override
    ? dotenv.config({ override: true, path: override })
    : dotenv.config({ override: true });
}
