# Outcome — arch baseline delta-vs-main gating

Status: implemented, gauntlet-green, PR open (do-not-merge; human review requested).

## What shipped

- **`packages/core/src/architecture/baseline-resolver.ts`** (new) — the whole feature:
  - `resolveArchBaseline()` — base-aware resolution. In a PR context reads the base ref's
    committed baseline via `git show <baseRef>:<repo-rel path>` (default `origin/main`,
    override `HARNESS_ARCH_BASE_REF`). Fail-open to the working-tree file on the base branch,
    unreachable base ref, non-git dir, or absent/invalid base copy. Handles nested package
    baselines via `git rev-parse --show-prefix`.
  - `ArchAllowanceSchema`, `loadArchAllowances()` (union ids, max category ceilings, skips
    invalid files), `filterDiffByAllowances()` (covers warning-severity new violations +
    ceiling-covered regressions; NEVER error-severity — the hard gate stays), `writeArchAllowance()`
    - `archAllowanceSlug()` (per-branch unique filename → conflict-free), `archAllowancesDir()`.
  - Re-exported from `architecture/index.ts` → `@harness-engineering/core`.
- **`packages/core/src/ci/check-orchestrator.ts`** `runArchCheck` — resolve base-aware, diff,
  filter by allowances. This is the pre-commit gate.
- **`packages/cli/src/commands/check-arch.ts`** `runCheckArch` — read path base-aware +
  allowance-filtered; `--update-baseline` writes a per-PR allowance in a PR context (requires
  `--reason`, refuses to allowance error-severity breaches) and keeps whole-snapshot behavior
  on the base branch (`wholeSnapshotUpdate` helper).
- **`.github/workflows/ci.yml`** refresh-baselines — deletes consumed
  `.harness/arch/allowances/*.json` (root + packages/cli) after regenerating the snapshot,
  stages the deletions in both the direct-push and PR-fallback paths, and extends the
  self-approval scope guard with the allowance dir prefixes (`$SCOPE_ALLOW`).
- Tests: `packages/core/tests/architecture/baseline-resolver.test.ts` (16),
  `packages/cli/tests/commands/check-arch.test.ts` (+6 PR-context allowance, incl. iterative +
  force-env cases), `packages/cli/tests/ci/baseline-diff-guard.test.ts` (12 total: scope-guard,
  allowance-deletion, refresh --allow-regress + force-env). Changeset:
  `.changeset/arch-baseline-delta-vs-main.md` (core + cli, minor).

## Acceptance criteria

| #   | Criterion                                                                                      | Status                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Branch passes with ONLY an allowance; baselines.json byte-identical to base (`git diff` empty) | Met — covered by check-arch.test.ts (asserts `git diff main -- baselines.json` empty)                    |
| 2   | Two branches' allowances never collide                                                         | Met — per-branch slug; conflict-free test in baseline-resolver.test.ts                                   |
| 3   | On main, `--update-baseline` still rewrites snapshot; refresh folds + deletes allowances       | Met — `wholeSnapshotUpdate` on base branch; workflow deletes + guard test                                |
| 4   | Genuine NEW error-severity threshold violation still HARD-FAILS                                | Met — `filterDiffByAllowances` never covers error severity + standalone threshold check; test asserts it |
| 5   | `origin/main` unavailable → working-tree fallback, never a false failure                       | Met — fail-open resolver; multiple fallback tests                                                        |
| 6   | Existing tests updated; new tests for resolution, allowance acceptance, conflict-free          | Met                                                                                                      |

## Verification run (Node 22)

- Build: `pnpm build` → 12/12.
- Typecheck: `turbo run typecheck --affected` → 13/13.
- Tests: core 3917 pass; cli 5692 pass; resolver suite 16 pass; guard suite 12 pass;
  `tests/scripts/baseline-gating.test.mjs` 11 pass. (Round-2 re-verify: typecheck 13/13; core
  arch suites 58; cli check-arch + guard 42.)
- Coverage ratchet: core + cli meet/exceed baselines.
- `generate-docs --check`: fresh (no new commands/flags).
- Dogfood: `harness ci check` arch gate PASSES cleanly on this branch (the one NEW warning-level
  functionLength violation my additions introduced was removed by extracting helpers, so no
  allowance file was needed for this PR itself).

## Adversarial-review fixes (round 2)

**FINDING 1 (BLOCKING) — refresh-baselines could not advance past an allowanced regression.**
Under the new model merged branches only add an allowance; they don't advance `baselines.json`.
So on main the merged code regresses vs the un-advanced committed baseline, and the refresh
job's `check-arch --update-baseline` hit the #530 guard and errored → the baseline never
advanced and allowances were never folded in (a treadmill). Fix, in `.github/workflows/ci.yml`:
the refresh invocation now passes `--allow-regress --reason "post-merge refresh: …"` (it is the
single authoritative post-merge updater and SHOULD absorb the merged regressions — that IS
folding the allowances in; the existing step then deletes the consumed files). I additionally
found and fixed a subtler variant: the refresh job checks out a **detached HEAD** at the merged
SHA, where the base-aware resolver's branch-name check ('main') fails and, if `origin/main` were
reachable, it would pick `base-ref` and **write an allowance instead of advancing the snapshot**.
Added a `HARNESS_ARCH_FORCE_WORKING_TREE=1` escape hatch (honored first in `resolveArchBaseline`)
set on that step, pinning whole-snapshot resolution deterministically. Both push paths (direct
push and the #671 branch-PR fallback) share this single regenerated snapshot + allowance-deletion.

- Coverage: `resolveArchBaseline` force-env → working-tree (resolver test); CLI-level test that
  `--update-baseline --allow-regress` under the force env **advances** the on-disk snapshot past a
  regression and writes **no** allowance; workflow-parse test asserts the step carries both
  `--allow-regress --reason` and `HARNESS_ARCH_FORCE_WORKING_TREE=1`.
- **Coverage gap (noted):** the workflow **shell script itself** (the `rm`/`git add -A`/`git rm
--ignore-unmatch` sequencing and the branch-PR-fallback re-apply) is not unit-testable from
  vitest. It is covered only by static workflow-parse assertions + the CLI-level behavior tests
  of the command the step invokes. End-to-end it exercises only on a real merge to main.

**FINDING 2 (IMPORTANT) — iterative `--update-baseline` dropped previously-acknowledged violations.**
`writeAllowanceUpdate` loaded coverage from ALL allowance files _including the branch's own_ and
rebuilt its file from only the newly-uncovered violations — so ack {A}, then add B, re-run →
rewritten as {B}, dropping A. Fix: added `excludeFiles` to `loadArchAllowances`; the write path
now excludes the branch's OWN slug file from the coverage filter, so the rebuilt allowance is the
FULL current set vs base ({A,B}). Also: a bare re-run (no new `--reason`) now reuses the reason
already recorded in the branch's own allowance, so iterating never re-demands the reason.

- Coverage: resolver `excludeFiles` unit test; CLI iterative test (ack A in `foo.ts`, add B in
  `bar.ts`, bare re-run → allowance covers {A,B} and reuses the run-1 reason).

**FINDING 3 (MINOR) — scope-guard prefix permits allowance additions, not only deletions.**
`gh pr diff --name-only` cannot distinguish add from delete, so the `allowances/` dir prefix
technically also permits an addition to self-approve. Tightened the workflow comment to record
this as a conscious, negligible-risk sign-off (the refresh job only ever DELETES allowances; an
allowance file is inert unless a matching regression is present and would be folded+deleted by
the very next refresh regardless). Not changed further.

**Pre-existing, out-of-scope (conscious sign-off):** the CI orchestrator's `runArchCheck` does
NOT compute a separate `findThresholdViolations` pass the way the CLI `check-arch` does — it
relies on the diff's per-violation severity. This is pre-existing behavior, unchanged here.
Error-severity NEW violations still hard-fail in both paths (the orchestrator pushes them with
`severity: 'error'`; `filterDiffByAllowances` never covers error severity), so the criterion-4
guarantee holds; the divergence is only in how pre-existing/threshold reporting is framed. Left
as-is by design.

## Notes / follow-ups

- Coverage/benchmark baselines are out of scope (they already jitter-gate); revisit only if
  they keep cascading.
- One transient flake observed: `turbo run test:coverage --affected --concurrency=2` had
  `core#test:coverage` fail once under compound load (machine-load flake, matches the known
  spawn-starvation pattern). Re-running core coverage alone passed cleanly (3917). Warmed the
  turbo cache with a sequential (`--concurrency=1`) run so the pre-push's identical invocation
  is a cache hit — clean push.
