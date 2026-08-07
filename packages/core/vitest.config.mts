import { defineConfig } from 'vitest/config';
// eslint-disable-next-line import/no-relative-packages -- config reaches into repo-root scripts/ on purpose
import { prepushTestOptions } from '../../scripts/vitest-prepush-reporter.mjs';

export default defineConfig({
  test: {
    ...prepushTestOptions(),
    globals: true,
    environment: 'node',
    // Generous global ceiling. Many core suites spawn real git/node subprocesses
    // (baseline-resolver, derive-repo, git-scan, hotspot, event-sourcing
    // concurrency). Under `test:coverage` the v8 instrumentation plus parallel
    // workers starve those subprocess spawns of CPU, so a 15s default timed out
    // intermittently even on green code. A larger ceiling only tolerates slow /
    // loaded runners — a genuine hang still fails — so it cannot mask a real bug.
    testTimeout: 60_000,
    // Same rationale for setup/teardown hooks, which have their own separate
    // budget (vitest default 10s). Several suites do `git init` + commits inside
    // `beforeEach` via execSync; under coverage-load CPU starvation those hooks
    // blew the 10s default and failed green suites. Raise the hook ceiling too.
    hookTimeout: 60_000,
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
