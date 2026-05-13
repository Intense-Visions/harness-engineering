import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    setupFiles: ['./tests/setup.ts'],
    // Restrict discovery to source/test trees. Without this, vitest 4's
    // default include picks up compiled `dist/**/*.test.js` artifacts whose
    // sibling data files (e.g. `template.md`) are not copied during build.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'benchmarks/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.bench.ts',
        'src/index.ts', // Re-exports
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 73,
        statements: 80,
      },
    },
  },
});
