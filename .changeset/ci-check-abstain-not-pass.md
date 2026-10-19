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

**An abstention is scoped to a gate the project actually asked for.**
`traceability` abstains only when a `minCoverage` floor is configured, because
that floor is the only thing the check can fail on; with no floor the gate
asserts nothing and stays a plain, exit-`0` skip. That matches `phase-gate`
(`phaseGates.enabled`) and `security` (`security.enabled`), which abstain only
over a gate the operator opted into.

**`harness init` and `harness ci init` are two of the pipelines this touches,
and both stay green.** The three `ci init` emitters (GitHub Actions, GitLab,
generic script) all run a bare `harness ci check --json`, and nothing scaffolds
a `harness scan` step — so a scaffolded project had to be green without one.
Two fixes make that true honestly rather than by skipping:

- `traceability` no longer abstains on the scaffolded config, which configures
  no `minCoverage` (see above).
- The `basic`, `intermediate` and `load-bearing-minimum` templates now scaffold
  `performance.entryPoints`. They configured complexity and coupling thresholds
  but no entry point for the analyzers to walk from, so `perf` and `entropy`
  failed with "Could not resolve entry points" — a gate configured but
  unrunnable, which under this change is an abstention and a red pipeline.
  `performance.entryPoints` is also now declared on the config schema; it was
  previously reachable only through `.passthrough()`.

A freshly scaffolded project now reports `exitCode 0`, `abstained: 0`,
`skipped: 0` — every gate ran.

**New: `deps`, `entropy` and `performance` gain the `enabled` opt-out their
sibling gates already had.** `security`, `architecture`, `traceability` and
`phaseGates` could all be declared not-applicable with `enabled: false`; these
three could not, which left a Go, Python, Rust or Java project no honest way to
be green — `layers` is meaningless there, and an absent `layers` abstains. The
distinction the orchestrator now draws:

- **Not applicable** — `deps.enabled: false` on a stack with no TypeScript
  dependency graph. A deliberate declaration, exactly like `--skip deps`, and it
  never counts as an abstention.
- **Could not run** — the gate wanted to evaluate and had nothing to evaluate
  with. Still an abstention, still exits `1`.

The four language templates now declare `deps`, `entropy` and `performance`
not-applicable (all three analyzers are TypeScript-based), `rust-base` also
declares `security` not-applicable because `.rs` is not in
`SECURITY_SCAN_EXTENSIONS`, and `advanced` gains the `performance.entryPoints`
its siblings have plus the starter `src/index.ts` it was missing.

**Every shipped template now gets a green first `harness ci check` with zero
abstentions** — verified end to end across all four adoption levels, all four
language bases and all six framework overlays, and pinned statically by
`packages/cli/tests/templates/performance-entry-points.test.ts` so a future
template cannot ship a red first build.

`run_ci_checks` (MCP) returns the same report verbatim, so `skipReason`,
`summary.abstained` and `exitCode` reach that surface unchanged; its tool
description now says so, and a test pins the pass-through.
