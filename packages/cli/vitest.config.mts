import { defineConfig } from 'vitest/config';
// eslint-disable-next-line import/no-relative-packages -- config reaches into repo-root scripts/ on purpose
import { prepushTestOptions } from '../../scripts/vitest-prepush-reporter.mjs';

export default defineConfig({
  test: {
    ...prepushTestOptions(),
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // NOTE: this config used to detect `--coverage` from argv and forward it to
    // the workers as `HARNESS_COVERAGE`, so that a timing-sensitive test could
    // relax a millisecond budget under v8 instrumentation. Its sole consumer in
    // this package was `scan-config.test.ts`'s wall-clock budget, which was
    // removed as part of the #2046 flake class — a relaxed budget lowers the
    // failure rate without removing the nondeterminism. The plumbing went with
    // it. (`packages/orchestrator/vitest.config.mts` keeps an independent copy of
    // the pattern; that one still has a live consumer.)
    //
    // 37 test files in this package spawn `node`/`git` subprocesses. On the
    // pre-push gate the package runs under v8 coverage with files in parallel,
    // and `turbo --concurrency=2` may run a second package's suite alongside it.
    // Under that compound load, subprocess cold-start starves for CPU: single-
    // spawn tests were observed taking 42-46s against the old 30s default and
    // failing with a *timeout* (never an assertion) even though every spawn
    // ultimately succeeded (#620). A timeout is a latency ceiling, not a
    // correctness gate — raising it removes the false failures without weakening
    // any assertion or reducing parallelism (which would slow the gate). CI
    // still runs the full authoritative suite. Serial spawn-loop tests that need
    // more headroom set an even higher per-test timeout locally.
    testTimeout: 90_000,
    hookTimeout: 90_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: ['tests/**', 'dist/**'],
    },
  },
});
