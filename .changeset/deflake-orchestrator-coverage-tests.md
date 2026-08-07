---
'@harness-engineering/orchestrator': patch
---

Deflake orchestrator tests that fail intermittently under `test:coverage`.

The telemetry-latency p99 budget carried a coverage-relaxation branch keyed on
`NODE_V8_COVERAGE` / `VITEST_COVERAGE`, but vitest sets neither in the worker
environment under `--coverage`, so the branch was dead and the strict 5 ms
budget applied under coverage — where v8 instrumentation plus parallel-worker
CPU starvation routinely pushes the measured delta past it. The vitest config
now detects `--coverage` in the CLI argv and forwards it to the worker as
`HARNESS_COVERAGE`, which the test reads to apply the intended relaxed budget.
The assertion (exporter overhead is bounded) is preserved, just made
deterministic under coverage.

The package's global test/hook timeout ceiling is raised 90s → 120s. Several
integration/tracker suites run `git init` + commits inside `beforeEach` via
`execSync`; under full-suite coverage load those subprocess cold-starts
occasionally blew the 90s hook ceiling on green code. A higher ceiling only
tolerates a slow/loaded runner — a genuine hang still fails — so it cannot mask
a real bug.

The server integration `SC8` test replaced a fixed 1 s sleep (racing the
asynchronous plan-watcher auto-resolve under load) with a polling `vi.waitFor`,
so it resolves as soon as the watcher fires and only fails if resolution never
happens.

Test-only and deterministic: no source or behavior changes, no assertions
weakened, no tests skipped, coverage unchanged.
