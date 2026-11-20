import { defineConfig } from "vitest/config";
import { ensureTestEnvFile } from "./scripts/ensure-test-env";

// The environment file is written on demand: the throwaway database that the
// ordinary test run builds lives in the same directory and clears it, so a
// file that was created by hand would be gone by the next `npm test`.
const testEnvFile = ensureTestEnvFile();

/**
 * The integration tests run against a real PostgreSQL server.
 *
 * They are a separate project because they need a database: the database
 * comes from docker-compose.test.yml, and the environment file below points
 * the application at it. Without that file the suite skips itself, so a
 * machine without the database still runs the ordinary test suite.
 *
 *   docker compose -f docker-compose.test.yml up -d
 *   npm run build:test-schema
 *   npm run gen:test-data
 *   npm run test:integration
 */
export default defineConfig({
  test: {
    include: ["server/**/*.integration.test.ts"],
    environment: "node",
    env: {
      // The application's .env is authoritative and cannot be overridden from
      // the shell, so the test run names the file it wants instead.
      PAYROLL_ENV_FILE: testEnvFile,
    },
    // A batch calculation over five hundred employees is not instant.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    // One file at a time: the tests share a single schema and write to it.
    fileParallelism: false,
    maxWorkers: 1,
  },
});
