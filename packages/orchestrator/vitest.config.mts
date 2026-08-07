import { defineConfig } from 'vitest/config';

// Coverage instrumentation (v8) is only active when the run passed `--coverage`
// (i.e. `test:coverage`). Vitest does NOT propagate a coverage flag into the
// worker `process.env` (neither NODE_V8_COVERAGE nor VITEST_COVERAGE is set
// there), so a test that needs to relax a timing-sensitive budget under
// coverage cannot detect it on its own. Detect it here in the config process —
// where the CLI argv is visible — and forward it via `test.env` so the worker
// can read `process.env.HARNESS_COVERAGE`. Consumed by telemetry-latency's
// coverage-aware p99 budget.
const COVERAGE = process.argv.includes('--coverage');

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    environment: 'node',
    // Forward the coverage signal into the worker environment (see COVERAGE note
    // above). Empty string when not running under coverage.
    env: { HARNESS_COVERAGE: COVERAGE ? '1' : '' },
    // 37 test files here spawn subprocesses. Like the cli package, on the
    // pre-push gate (v8 coverage, files in parallel, `turbo --concurrency=2`
    // running a second package alongside) subprocess cold-start starves for CPU
    // and correct tests fail with a *timeout* rather than an assertion — this
    // package was observed flaking in the pre-push gate right after cli (#620).
    // A timeout is a latency ceiling, not a correctness gate; raising it removes
    // the false failures without touching parallelism. CI runs the full suite.
    //
    // Bumped 90s → 120s: several integration/tracker suites do `git init` +
    // commits inside `beforeEach` via execSync. Under full-suite coverage load
    // (234 files, parallel workers all cold-starting git subprocesses at once)
    // that hook still occasionally blew the 90s ceiling on otherwise-green code
    // (orchestrator-model-pool, orchestrator, file-less-stub). A higher ceiling
    // only tolerates a slow/loaded runner — a genuine hang still fails — so it
    // cannot mask a real bug.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
