---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

`harness ci check`: a check that could not run no longer reports a pass

**Breaking behaviour change for CI pipelines.** Previously, `harness ci check`
could print `All checks passed` and exit `0` on a run where several of its nine
checks never evaluated anything. Three paths produced it: a check that crashed
was downgraded to a warning (and warnings exit `0`), `deps` reported `pass` with
no `layers` configured, and `traceability` reported `pass` with no knowledge
graph — even at `minCoverage: 100`.

A check that wanted to run and could not now reports `status: 'skip'` with a
`skipReason`, is not counted in `summary.passed`, and forces exit `1`. The new
`summary.abstained` counts these separately from operator-requested skips.

**What this means for your pipeline:** a build that is green today _because_ a
gate silently did not run will start failing. That is the defect being fixed —
the gate was never actually enforcing anything — but it surfaces in your CI, not
ours. The report will name each check that could not run and what it needed.

**Escape hatch:** an explicit `--skip` is still an acknowledged, exit-`0`
non-run. To keep the previous exit code while you fix the configuration:

```bash
harness ci check --skip deps,traceability
```

Preferred fixes: add `layers` to `harness.config.json` for `deps`, run
`harness scan` (or set `traceability.enabled: false`) for `traceability`, and
set `performance.entryPoints` for the analyzers that reported "Could not resolve
entry points".
