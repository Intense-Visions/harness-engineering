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
    // Isolate the subprocess-spawning suites' process pool on Windows. Several
    // core suites (mechanical-gate, baseline-resolver, git-scan, ...) spawn real
    // `npm`/`git` children via execSync. On win32 those spawns are slow AND, run
    // concurrently across parallel worker processes under v8 coverage, they
    // storm Windows process creation and starve each other of CPU — the exact
    // nondeterminism behind the intermittent gate.test.ts timeouts. Serializing
    // test FILES on win32 removes the concurrent-spawn storm (each file still
    // gets its own isolated process) without touching mac/linux parallelism.
    // This removes the nondeterminism at its source rather than merely widening
    // a timeout, which the raised ceiling below already showed does not fix it.
    fileParallelism: process.platform === 'win32' ? false : true,
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
