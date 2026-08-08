import { defineConfig } from 'vitest/config';
// eslint-disable-next-line import/no-relative-packages -- config reaches into repo-root scripts/ on purpose
import { prepushTestOptions } from '../../scripts/vitest-prepush-reporter.mjs';

// v8 coverage is only active when the run passed `--coverage` (i.e.
// `test:coverage`). Vitest does not propagate a coverage flag into the worker
// `process.env`, so a test that needs to relax a timing-sensitive budget under
// coverage cannot detect it on its own. Detect it here — where the CLI argv is
// visible — and forward it via `test.env` as HARNESS_COVERAGE. Consumed by
// scan-config's coverage-aware perf budget.
const COVERAGE = process.argv.includes('--coverage');

export default defineConfig({
  test: {
    ...prepushTestOptions(),
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // Forward the coverage signal into the worker environment (see COVERAGE note
    // above). Empty string when not running under coverage.
    env: { HARNESS_COVERAGE: COVERAGE ? '1' : '' },
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
