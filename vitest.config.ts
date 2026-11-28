import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both trees carry unit tests: src/ holds the payroll engines, server/
    // holds the pure compliance/domain helpers extracted out of route files.
    //
    // The integration tests are excluded here on purpose: they need a
    // PostgreSQL server and run as their own project
    // (vitest.integration.config.ts, `npm run test:integration`).
    include: ['src/**/*.test.ts', 'server/**/*.test.ts', 'scripts/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.integration.test.ts'],
    environment: 'node',
  },
});