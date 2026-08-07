import { defineConfig } from 'vitest/config';
// eslint-disable-next-line import/no-relative-packages -- config reaches into repo-root scripts/ on purpose
import { prepushTestOptions } from '../../scripts/vitest-prepush-reporter.mjs';

export default defineConfig({
  test: {
    ...prepushTestOptions(),
    globals: true,
    environment: 'node',
    testTimeout: 15_000,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      processingConcurrency: 1,
    },
  },
});
