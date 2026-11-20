import path from "node:path";
import { ensureTestEnvFile } from "./ensure-test-env";

/**
 * Points the application at the test environment before anything loads it.
 *
 * The application's .env is authoritative and cannot be overridden from the
 * shell, so a script that needs another environment has to name the file it
 * wants. This module does that as the first import of the test scripts, so
 * they work the same way on every platform without the caller having to set
 * an environment variable first.
 *
 * It has to be imported before the database layer: that layer loads the
 * environment file when it is first imported.
 */
if (!process.env.PAYROLL_ENV_FILE) {
  process.env.PAYROLL_ENV_FILE = ensureTestEnvFile();
}
