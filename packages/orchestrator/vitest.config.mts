import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    // 37 test files here spawn subprocesses. Like the cli package, on the
    // pre-push gate (v8 coverage, files in parallel, `turbo --concurrency=2`
    // running a second package alongside) subprocess cold-start starves for CPU
    // and correct tests fail with a *timeout* rather than an assertion — this
    // package was observed flaking in the pre-push gate right after cli (#620).
    // A timeout is a latency ceiling, not a correctness gate; raising it removes
    // the false failures without touching parallelism. CI runs the full suite.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
