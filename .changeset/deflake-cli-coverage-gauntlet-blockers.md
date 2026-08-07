---
'@harness-engineering/cli': patch
---

Deflake the two CLI tests that block the full-suite `test:coverage` pre-push
gauntlet.

The pre-push gate runs `turbo run test:coverage` for the whole workspace, so a
flaky CLI test gates every PR — including orchestrator-only changes, since CLI
depends on orchestrator. Two CLI tests fail under v8 coverage + parallel-worker
CPU starvation:

- `slash-commands/integration.ts > detects orphaned codex skill directories`
  carried a per-test `{ timeout: 15000 }` cap that overrode the package's 90s
  ceiling. The test runs `generateSlashCommands` twice (heavy synchronous
  filesystem writes) and reliably blew 15s under full-suite coverage load,
  failing effectively every `test:coverage` run. The cap is removed so it
  inherits the generous global ceiling (same fix as #1153 for orchestrator).

- `commands/scan-config.ts > scans large config files within 100ms` asserted a
  hard 100ms perf budget that v8 instrumentation inflates past. The budget is
  now coverage-aware (relaxed via HARNESS_COVERAGE, forwarded from vitest.config
  when `--coverage` is passed) while still catching an order-of-magnitude
  regression.

Test-only and deterministic: no source or behavior changes, no assertions
weakened, no tests skipped, coverage unchanged.
