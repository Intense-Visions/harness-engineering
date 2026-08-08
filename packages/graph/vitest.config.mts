import { defineConfig } from 'vitest/config';
// eslint-disable-next-line import/no-relative-packages -- config reaches into repo-root scripts/ on purpose
import { prepushTestOptions } from '../../scripts/vitest-prepush-reporter.mjs';

export default defineConfig({
  test: {
    ...prepushTestOptions(),
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: ['node_modules/', 'tests/', 'benchmarks/', '**/*.test.ts', '**/*.bench.ts', 'src/index.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
