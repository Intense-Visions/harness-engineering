---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': major
---

`harness ci check`: a check that could not run no longer reports a pass

**Breaking behaviour change for CI pipelines.** Previously, `harness ci check`
could print `All checks passed` and exit `0` on a run where several of its nine
checks never evaluated anything. Five paths produced it: a check that crashed
was downgraded to a warning (and warnings exit `0`), `deps` reported `pass` with
no `layers` configured, `traceability` reported `pass` with no knowledge
graph — even at `minCoverage: 100` — `security` reported `pass` when its glob
matched zero files, so a bad `security.exclude` silently un-enforced the gate,
and `phase-gate`, when _enabled_, reported a `warning` saying the orchestrator
cannot evaluate it, which left the gate at `warn` and the run at exit `0`.

A check that wanted to run and could not now reports `status: 'skip'` with a
`skipReason`, is not counted in `summary.passed`, and forces exit `1`. The new
`summary.abstained` counts these separately from operator-requested skips.

**What this means for your pipeline:** a build that is green today _because_ a
gate silently did not run will start failing. That is the defect being fixed —
the gate was never actually enforcing anything — but it surfaces in your CI, not
ours. The report will name each check that could not run and what it needed.

`@harness-engineering/cli` is post-1.0 (12.x), so this lands there as a **major**;
`core` (0.54.x) and `types` (0.34.x) are pre-1.0, where `minor` is the breaking level.

**Escape hatch:** an explicit `--skip` is still an acknowledged, exit-`0`
non-run. To keep the previous exit code while you fix the configuration:

```bash
harness ci check --skip deps,traceability
```

Preferred fixes: add `layers` to `harness.config.json` for `deps`, run
`harness scan` (or set `traceability.enabled: false`) for `traceability`, set
`performance.entryPoints` for the analyzers that reported "Could not resolve
entry points", widen the scan pattern / narrow `security.exclude` for
`security`, and run `harness check-phase-gate` as its own CI step for
`phase-gate`.

The `security` abstention matches what `harness check-security` has refused to
call clean since #1146 (`scannedNothing`) — the `ci check` copy of the gate had
drifted from it.

`run_ci_checks` (MCP) returns the same report verbatim, so `skipReason`,
`summary.abstained` and `exitCode` reach that surface unchanged; its tool
description now says so, and a test pins the pass-through.
