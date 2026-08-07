---
'@harness-engineering/core': patch
'@harness-engineering/orchestrator': patch
---

Deflake timing-sensitive tests that fail intermittently under `test:coverage`.

Several suites spawn real git/node subprocesses (`baseline-resolver`,
`derive-repo`, `git-scan`, `hotspot`, event-sourcing `concurrency` in core;
`claim-coordination` and `orchestrator` integration in orchestrator) and one
exercises a real HTTP receiver with a retry/backoff path (the core OTLP
exporter). Under v8 coverage instrumentation plus parallel workers, those
subprocess spawns are starved of CPU on loaded runners and intermittently blew
tight timeouts — failing green code and blocking the pre-push gauntlet for every
PR touching core (orchestrator is `--affected` by any core change).

The fix is test-only and deterministic:

- **core**: raise the global vitest `testTimeout` and the separately-budgeted
  `hookTimeout` (git init/cleanup runs in `beforeEach`) to a generous 60s
  ceiling, and widen the OTLP exporter's `vi.waitFor` budgets with a small poll
  interval.
- **orchestrator**: the package `vitest.config` already sets a generous 90s
  `testTimeout`/`hookTimeout` for exactly this reason, but four
  `claim-coordination` tests and two `orchestrator` integration tests carried
  per-test `{ timeout: 15000 }` overrides that capped them _below_ that global,
  defeating the protection. Those caps are removed so the tests inherit the 90s
  ceiling.

A larger ceiling only tolerates slow/loaded runners; a genuine hang still fails,
so it cannot mask a real bug. No assertions were weakened, no tests skipped, and
coverage is unchanged.
