# Proposal: Merged-but-unreleased inventory as a first-class metric

**Issue:** #1526 · **Milestone:** v5.0 — Telemetry & Effectiveness · **Route:** feature · **Scope:** measurement / report only

## Problem

Merged is not shipped. A dogfood consumer accumulated 1,132 merged PRs with **0
GitHub releases, 0 tags, and 138 pending changesets** — every changeset an
unshipped unit of declared change. The release pipeline is configured and active,
so this is not a broken pipeline but an _unmeasured_ one: merge throughput rose
while release throughput stayed flat, and nothing in the harness noticed. Any
throughput claim built on merge counts is inflated by exactly this gap.

The harness already tracks codebase health (`health-snapshot`) and deploy
readiness (`check-deployment`), but it has no measure of **work-in-inventory** —
the lean-manufacturing number that says "we merge code but do not release it".

## Goal

Compute and report the **merged-but-unreleased inventory** for a repository: the
set and count of changes merged into the mainline but not yet in a published
release, plus the age of the oldest unreleased change, with a threshold that
warns when inventory outgrows release cadence. Report-only — no blocking gate.

## Approach

Follow the established pure-engine + injected-port pattern (mirrors
`packages/core/src/deployment/`): a pure core engine over injected git and
filesystem ports, with a thin CLI adapter that supplies node IO.

The metric derives "shipped" from the release machinery this repo already uses:

- **Version tags** — the latest git tag matching a configurable pattern
  (default `v*`) is the release boundary. Commits reachable from `HEAD` but not
  from that tag are _unreleased_.
- **Changesets** — pending files under `.changeset/` (excluding `README.md` and
  `config.json`) are declared-but-unshipped units of change.

For each it computes count and age (age from the git date the file/commit
entered history), and evaluates configurable thresholds.

## Decisions

- **D1 — Denominator is explicit.** Every result carries `channel` /
  `shippedDefinition` naming exactly what defines "shipped" (e.g. `git tags
matching "v*"`). A metric without its denominator is uninterpretable (AC2).
- **D2 — Zero-release repos are `unbounded`, never omitted.** When no tag matches
  the pattern there is no release boundary, so the entire mainline history is
  inventory. The result reports `status: "unbounded"` with `lastRelease: null`
  and still fires the threshold when pending inventory exists (AC1, AC3).
- **D3 — Report-only.** Default exit code is 0. A `--strict` flag exits non-zero
  on breach for opt-in CI enforcement, but the metric never blocks by default.
- **D4 — Deterministic core.** `computeReleaseInventory` takes an injected
  `now: Date`, so age math is testable without wall-clock flake.
- **D5 — Merge count is the headline PR signal.** Unreleased _merge_ commits
  approximate merged-but-unreleased PRs on a squash/merge-commit mainline;
  total unreleased commit count is also reported for non-merge-commit repos.

## Success Criteria

- **SC1 [AC1]** A repo with 0 releases and accumulating changesets reports a
  non-zero, rising inventory and `breached: true` (the threshold fires).
- **SC2 [AC2]** The result carries its denominator: `channel.kind`,
  `channel.pattern`, and a human `shippedDefinition` string.
- **SC3 [AC3]** A zero-release repo reports `status: "unbounded"` (metric
  present, `unbounded: true`) rather than omitting the metric.
- **SC4** `harness release-inventory` prints a scannable human report and a
  machine `--json` payload; both carry count, oldest-age, and the unreleased list.
- **SC5** Core engine is pure (injected ports + injected `now`), covered by unit
  tests for the tag-boundary, unbounded, empty, and threshold-breach cases.
- **SC6** `harness check-deps`, `harness validate`, typecheck, and lint show no
  NEW findings referencing the new modules; new vitest suites are green.

## Non-goals

- No dashboard rendering or digest wiring in this change (surfaces named in the
  issue are follow-ups; this change ships the metric + report + JSON payload
  those surfaces consume).
- No GitHub API calls — inventory is computed from local git + `.changeset/`,
  keeping it cheap, offline, and adopter-portable.
- No per-package (monorepo-deployable) fan-out; v1 reports one repo-level
  inventory against one release channel. Per-deployable breakdown is a follow-up.

## File Map

```
CREATE packages/core/src/release-inventory/types.ts
CREATE packages/core/src/release-inventory/changesets.ts
CREATE packages/core/src/release-inventory/compute.ts
CREATE packages/core/src/release-inventory/evaluate.ts
CREATE packages/core/src/release-inventory/index.ts
CREATE packages/core/src/release-inventory/*.test.ts
CREATE packages/cli/src/commands/release-inventory.ts
MODIFY packages/cli/src/commands/_registry.ts        (regen via generate:barrels)
MODIFY packages/core/src/index.ts                    (regen via generate:barrels)
MODIFY packages/cli/src/config/schema.ts             (add optional releaseInventory block)
```
