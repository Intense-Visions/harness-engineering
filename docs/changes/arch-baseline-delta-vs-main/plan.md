# Implementation plan — arch baseline delta-vs-main gating

Spec: `./proposal.md` (authoritative).

## Tasks

1. **Resolver + allowances module** — `packages/core/src/architecture/baseline-resolver.ts`
   - `resolveArchBaseline(projectRoot, baselinePath, manager, opts?)`: base-aware. In a PR
     context read the base baseline from `git show <baseRef>:<repo-rel path>` (default
     `origin/main`); fall back to the working-tree file when not a git repo, on the base
     branch, base ref unresolvable, or the file is absent/invalid on the base. FAIL-OPEN.
   - `ArchAllowanceSchema` + `loadArchAllowances()` (union violationIds, max category
     ceilings; skips invalid files), `filterDiffByAllowances()` (covers WARNING-severity
     new violations + category-ceiling regressions; NEVER error-severity — keeps the hard
     gate), `writeArchAllowance()` + `archAllowanceSlug()` (per-branch unique filename →
     conflict-free), `archAllowancesDir()`.
   - Export from `architecture/index.ts`.

2. **Wire CI gate** — `packages/core/src/ci/check-orchestrator.ts` `runArchCheck`: resolve
   base-aware baseline, diff, then filter by allowances.

3. **Wire CLI gate** — `packages/cli/src/commands/check-arch.ts` `runCheckArch`:
   - Read path: resolve base-aware baseline + allowance filter.
   - `--update-baseline`: in a PR (base-ref) context WRITE an allowance file (requires
     `--reason`; refuses to allow error-severity breaches); on main / no base keep the
     whole-snapshot behavior.

4. **refresh-baselines** — `.github/workflows/ci.yml`: after regenerating the snapshot,
   delete consumed `.harness/arch/allowances/*.json` (root + packages/cli) and stage the
   deletions; extend the diff-scope allowlist.

5. **Tests** — new `baseline-resolver.test.ts` (base-aware present/absent, allowance
   acceptance, error-severity still fails, conflict-free property); extend
   `check-arch.test.ts` (allowance write in git PR context); keep
   `tests/scripts/baseline-gating.test.mjs` green.

6. **Changeset** (`@harness-engineering/core` + `@harness-engineering/cli`, minor) + outcome note.

## Acceptance-criteria mapping

- AC1 branch passes with only an allowance, baselines.json byte-identical → tasks 1–3.
- AC2 two branches' allowances never collide → per-branch slug (task 1) + test (task 5).
- AC3 main still rewrites snapshot; refresh folds+deletes allowances → tasks 3–4.
- AC4 genuine NEW error-severity still HARD-FAILS → severity rule in filter (task 1).
- AC5 origin/main unavailable → working-tree fallback → resolver fail-open (task 1).
- AC6 tests updated/added → task 5.
