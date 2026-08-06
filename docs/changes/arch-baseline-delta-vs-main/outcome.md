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
- Tests: `packages/core/tests/architecture/baseline-resolver.test.ts` (14),
  `packages/cli/tests/commands/check-arch.test.ts` (+4 PR-context allowance),
  `packages/cli/tests/ci/baseline-diff-guard.test.ts` (+4 scope-guard/allowance). Changeset:
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
- Tests: core 3917 pass; cli 5692 pass; new resolver suite 14 pass; guard suite 11 pass;
  `tests/scripts/baseline-gating.test.mjs` 11 pass.
- Coverage ratchet: core + cli meet/exceed baselines.
- `generate-docs --check`: fresh (no new commands/flags).
- Dogfood: `harness ci check` arch gate PASSES cleanly on this branch (the one NEW warning-level
  functionLength violation my additions introduced was removed by extracting helpers, so no
  allowance file was needed for this PR itself).

## Notes / follow-ups

- Coverage/benchmark baselines are out of scope (they already jitter-gate); revisit only if
  they keep cascading.
- One transient flake observed: `turbo run test:coverage --affected --concurrency=2` had
  `core#test:coverage` fail once under compound load (machine-load flake, matches the known
  spawn-starvation pattern). Re-running core coverage alone passed cleanly (3917).
