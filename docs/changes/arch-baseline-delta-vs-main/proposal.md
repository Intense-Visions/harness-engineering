# Arch baseline: delta-vs-main gating (stop the baselines.json merge cascade)

## Problem

`.harness/arch/baselines.json` (and its nested `packages/cli/.harness/arch/baselines.json`)
conflicts on GitHub for nearly every open PR. Root cause, confirmed:

- The arch gate (`harness ci check` at pre-commit, and `runArchCheck` in CI) compares
  current metrics against the **committed working-tree** baseline via
  `ArchBaselineManager.load()` → `diff()`.
- When a PR adds any complexity, `diff()` reports new violationIds / an aggregate
  regression, so the gate fails. The developer runs `harness check-arch
--update-baseline`, which **rewrites the shared snapshot in the PR branch** — bumping
  `complexity.value` and inserting the PR's new sha256 violationIds into the sorted list.
- `.gitattributes` marks these files `merge=ours`, but that custom driver only runs on a
  local `git merge`; **GitHub's server-side merge does a plain 3-way text merge with no
  driver**, so the PR's diverged value/violationId lines conflict with main's.
- Every merge into main advances the baseline (via the `refresh-baselines` job), so all
  other open PRs re-conflict. A treadmill.

`ArchBaselineManager.update()`'s byte-stability trick (preserve `updatedAt`/`updatedFrom`
when `metricsEqual`) only helps **metric-neutral** PRs; any PR that genuinely moves
complexity still rewrites the snapshot and conflicts.

Coverage (`coverage-baselines.json`) and benchmark (`benchmark-baselines.json`) already
have jitter-suppressing merges (`mergeCoverageBaselines` / `mergeBenchmarkBaselines`) and
conflict far less, so this change targets the **arch** baseline; coverage/benchmark are
noted as follow-ups only if they prove to still cascade.

## Goal

A PR that adds complexity must be able to pass the arch gate **without committing any
change to `baselines.json`**, so the committed snapshot is owned solely by the post-merge
`refresh-baselines` job on main and never diverges on a feature branch.

## Design

### 1. Base-aware baseline resolution

Add a resolver that, in a PR context, loads the **base baseline from the merge target**
(`git show origin/main:.harness/arch/baselines.json`, falling back to the configured base
ref / merge-base) instead of the working-tree file. On `main` (or when no base ref / not a
git repo / file absent on base), fall back to the committed working-tree file exactly as
today. This is additive and must be behind a resolver so existing call sites
(`ArchBaselineManager.load()`, `check-orchestrator.runArchCheck`, `runCheckArch`) get the
right baseline for their context. Never fetch over the network implicitly during a normal
gate run — read from the already-fetched `origin/main` ref; if it is missing, fall back to
the working-tree file (fail-open to today's behavior, never fail-closed on infra).

### 2. Per-PR allowance files (conflict-free acknowledgment)

Intentional regressions are acknowledged with a **uniquely-named per-PR file** under
`.harness/arch/allowances/` (e.g. `<short-slug-or-timestamp>.json`) — the same
one-file-per-PR pattern as `.changeset/*.md` and `docs/roadmap.d/*.md`, which never
conflict because each PR adds its own file. Schema (draft):

```json
{
  "reason": "human-readable why",
  "categories": { "complexity": 312 },
  "violationIds": ["<sha256>", "..."],
  "createdFrom": "<commit>"
}
```

The gate accepts a regression iff a present allowance covers the new violationIds /
category deltas. `harness check-arch --update-baseline` in a PR context WRITES an allowance
file (with `--reason`) instead of rewriting the snapshot. On `main` / in the refresh job,
`--update-baseline` keeps its current whole-snapshot behavior.

### 3. refresh-baselines folds allowances in

The post-merge `refresh-baselines` job (`.github/workflows/ci.yml`) already runs
`check-arch --update-baseline` on main; extend it to **consume + delete** any
`.harness/arch/allowances/*.json` after regenerating the snapshot, so allowances are
transient (like consumed changesets). The committed snapshot remains authoritative and
single-writer.

## Acceptance criteria

1. A branch off main that adds a genuinely-more-complex function passes the local arch gate
   after adding ONLY an allowance file — `.harness/arch/baselines.json` is byte-identical to
   main's on the branch (verified: `git diff origin/main -- .harness/arch/baselines.json`
   is empty).
2. Two such branches, each with their own allowance file, merge into each other / main with
   NO conflict (allowance files are per-PR unique).
3. On `main`, `check-arch --update-baseline` still rewrites the snapshot as today, and the
   `refresh-baselines` job folds + deletes allowances.
4. A PR that adds a genuine NEW error-severity threshold violation still HARD-FAILS the gate
   (the gate is not weakened for real regressions — only the snapshot-commit requirement is
   removed).
5. When `origin/main` is unavailable (fresh clone, detached, non-git), the gate falls back
   to the working-tree baseline (today's behavior) — never a false failure.
6. Existing baseline-gating tests updated; new tests cover base-aware resolution, allowance
   acceptance, and the conflict-free property.

## Non-goals

- Coverage/benchmark baselines (separate follow-up; they jitter-gate already).
- Changing the metrics collectors or thresholds themselves.

## Risk / rollout

Touches the quality gate for every commit — must be conservative and fail-open on infra
gaps. Land behind clear tests; the `refresh-baselines` workflow edit is the highest-risk
piece (protected CI area) and needs careful review. Human review expected before merge.
