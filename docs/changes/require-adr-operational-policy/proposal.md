---
title: Require ADR for Operational Policy Changes
status: draft
milestone: v5.0 — Trust & Security Model
roadmap_ref: github:Intense-Visions/harness-engineering#565
priority: P2
keywords:
  [
    operational-policy,
    adr,
    check-operational-drift,
    hook-profiles,
    thresholds,
    skip-list,
    baseline-policy,
    diff-check,
  ]
---

# Require ADR for Operational Policy Changes

## Overview and Goals

Operational policy — hook profiles, the pre-commit `--skip` list, `harness.config.json`
threshold values, and baseline-update policy — is load-bearing: each of these
controls how loudly a gate fires, or whether it fires at all. Yet these surfaces
accumulate silently in ordinary commits, with no ADR-grade record of the decision
to soften (or harden) them. The pre-commit auto-baseline behavior (Pass 1 #1)
entered the codebase exactly this way — a gate was softened without a documented
decision.

This change adds `harness check-operational-drift`: a diff-based check that FLAGS
when a change touches an operational-policy surface WITHOUT a corresponding ADR in
`docs/knowledge/decisions/` in the same diff. It forces "we silently softened a
gate" to surface as a deliberate ADR.

## Why a new command (not extending `enforce-architecture`)

`harness enforce-architecture` answers a different question (layer boundaries,
import direction, module size) over the _code graph_. Operational drift is a
_diff-vs-ADR correspondence_ check with its own base-ref resolution, config-field
diffing, and advisory severity model. Bolting that onto the architecture command
would overload a cohesive command with an unrelated axis. A focused
`check-operational-drift` mirrors the existing `check-*` command family
(`check-docs`, `check-security`, …), registers cleanly via `_registry.ts`, and
composes into CI independently.

## Operational-policy surfaces watched

The watch list is documented and config-overridable via `operationalPolicy` in
`harness.config.json`. Defaults:

- `.husky/**` — all git hook scripts. This also covers the pre-commit `--skip`
  list, which lives as a `SKIP="…"` assignment inside `.husky/pre-commit`.
- `packages/cli/src/hooks/profiles.ts` — the hook profile tiers
  (minimal / standard / strict).
- `harness.config.json` threshold fields — field-level, not whole-file. The
  default watched sub-trees are:
  - `architecture.thresholds`
  - `performance.complexity.thresholds`
  - `performance.coupling.thresholds`
  - `security.strict`
  - `security.rules`

### Config threshold diffing (scope)

For `harness.config.json` the check does **field-level** diffing: it reads the
file at the base ref (`git show <base>:harness.config.json`) and at the working
tree, then deep-compares each watched dotted sub-tree. Only a change to a watched
threshold sub-tree flags — an unrelated edit (e.g. `name`) does not. If the base
version cannot be read (new file, unreadable ref), the check **falls back to
flagging the whole file** and says so in the finding.

## ADR correspondence

A "corresponding ADR" is any file added or modified under
`docs/knowledge/decisions/` (config: `operationalPolicy.adrDir`) in the same diff.
If one is present, the operational change passes. ADRs there follow the existing
`NNNN-slug.md` naming convention.

## Base ref

Like the other diff-based checks, the base defaults to the merge-base of `HEAD`
with the default branch (resolved from `origin/HEAD`, falling back to `main`).
`--base <ref>` overrides. Changed files are the union of the tracked diff
(base → working tree) and untracked files, so the check works both in CI
(committed PR diff) and locally (an ADR staged alongside the operational change).

## Severity

Advisory by default: findings are reported and the command exits 0. Set
`operationalPolicy.severity: "blocking"` (or pass `--strict`) to make a missing
ADR a non-zero exit. This matches the graduated-enforcement posture of the other
`check-*` commands and lets teams adopt the check in report-only mode first.

## Testing

- Operational change (hook profile / `.husky` / config threshold) **with** an ADR
  in the same diff → pass.
- Operational change **without** an ADR → flag.
- Unrelated change (no operational surface) → pass.
- Config file changed but no watched threshold field touched → pass.
- Config base undiffable → whole-file fallback flag.
- Git-seam tests for base-ref resolution and changed-file collection.

## Integration points

The command is dogfooded as an **advisory** step in the `build-and-test` job of
`.github/workflows/ci.yml`, alongside the existing `check-vocabulary` /
`check-arch` invocations. It is guarded to `pull_request` events only (the check
is diff-based and needs a base), and runs in default mode — **no `--strict`** —
so a missing ADR is surfaced in the job log but exits 0 and never fails the PR:

```yaml
- name: check-operational-drift (advisory)
  if: github.event_name == 'pull_request'
  run: node packages/cli/dist/bin/harness.js check-operational-drift --base origin/${{ github.event.pull_request.base.ref }}
```

Because the `build-and-test` checkout is shallow, a preceding
`git fetch origin ${{ github.event.pull_request.base.ref }}` step (same
`pull_request`-only guard) makes `origin/<base_ref>` resolvable for the diff —
the same base-fetch pattern `required-review.yml` uses. Promote the step to
`--strict` (or set `operationalPolicy.severity: "blocking"`) once it has proven
stable on real PRs to make a missing ADR blocking.
