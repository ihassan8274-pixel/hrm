import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Both trees carry unit tests: src/ holds the payroll engines, server/
    // holds the pure compliance/domain helpers extracted out of route files.
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    environment: 'node',
  },
});