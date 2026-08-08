# Plan: Make the pre-push test gate diagnosable

**Date:** 2026-08-07 | **Spec:** `docs/changes/diagnosable-pre-push-gate/proposal.md` | **Tasks:** 9 | **Time:** ~40 min | **Integration Tier:** small

## Goal

On a non-zero pre-push `test:coverage` run, print a concise "these tests failed" summary (package + test title + file + first failure line), driven by a per-package vitest JSON report that is written only under a pre-push-only `HARNESS_PREPUSH=1` flag — so normal and CI runs stay byte-identical.

## Observable Truths (Acceptance Criteria)

Mapped to the spec's five success criteria (SC1–SC5):

1. **(SC1)** When `test:coverage` exits non-zero under the gate, the hook prints a grouped summary naming each failing test's package, title, source file, and first failure line — even with no surviving `FAIL` line. _Proven by Task 2 (unit) + Task 8 (forced-failure e2e)._
2. **(SC2)** When the test run passes, the summarizer is not invoked and hook output is unchanged. _The `if ! ...; then summarize; exit 1; fi` guard runs the summarizer only on the non-zero branch — Task 7; confirmed Task 8._
3. **(SC3)** A normal `vitest run` / `npm run test` / CI run (no `HARNESS_PREPUSH`) writes no `.vitest-report.json` and reporter behavior is byte-identical. _Proven by Task 1 (`prepushTestOptions()` returns `{}` when flag unset) + Task 4–6 flag-off verification + green CI._
4. **(SC4)** When a failure produces no report files, the summarizer prints one honest "no machine-readable reports found" line and the push is still blocked (`exit 1`). _Proven by Task 2 (unit, empty case) + hook `exit 1` outside the summarizer (Task 7)._
5. **(SC5)** After the hook edit, a happy-path push still succeeds (valid POSIX sh, `set -e` preserved). _Proven by Task 7 (`dash -n`) + Task 8 human-verify real push._

## File Map

- CREATE `scripts/vitest-prepush-reporter.mjs` (shared reporter helper)
- CREATE `scripts/summarize-test-failures.mjs` (parser + summary printer + CLI main)
- CREATE `packages/cli/tests/ci/vitest-prepush-reporter.test.ts` (unit test for helper)
- CREATE `packages/cli/tests/ci/summarize-test-failures.test.ts` (unit test for summarizer)
- MODIFY `.gitignore` (add `**/.vitest-report.json`)
- MODIFY `packages/burn/vitest.config.mts`
- MODIFY `packages/cli/vitest.config.mts`
- MODIFY `packages/core/vitest.config.mts`
- MODIFY `packages/dashboard/vitest.config.mts`
- MODIFY `packages/eslint-plugin/vitest.config.mts`
- MODIFY `packages/graph/vitest.config.mts`
- MODIFY `packages/intelligence/vitest.config.mts`
- MODIFY `packages/linter-gen/vitest.config.mts`
- MODIFY `packages/local-models/vitest.config.mts`
- MODIFY `packages/orchestrator/vitest.config.mts`
- MODIFY `packages/signals/vitest.config.mts`
- MODIFY `packages/types/vitest.config.mts`
- MODIFY `.husky/pre-push` (affected branch + full-fallback branch)

## Decisions carried from the spec (do not re-decide)

- Reporter format: vitest built-in `json` reporter (jest-compatible shape).
- Activation gated behind pre-push-only `HARNESS_PREPUSH=1`; inert (`{}`) otherwise.
- A single shared helper spread into all 12 configs (DRY, spread-first so no key is clobbered).
- Summarizer degrades gracefully, always exits 0; the hook owns `exit 1`.
- Stale reports are cleaned before the run.
- The `--concurrency=1` retry tweak (#1094 suggestion #3) is a deliberate NON-GOAL — not in this plan.

## Environment / conventions (apply to every task)

- **Node 22 for all verification:** prefix commands with `source ~/.nvm/nvm.sh && nvm use 22`.
- **Test placement follows the repo's established pattern** (`packages/cli/tests/ci/*.test.ts` importing repo-root `scripts/` via a relative path with `// eslint-disable-next-line import/no-relative-packages`), matching `diff-scope-guard.test.ts`. This is why the summarizer/reporter tests are `.test.ts` in `packages/cli`, not `scripts/*.test.mjs` — it runs under the existing gate and lint config with zero new tooling. (Spec permits either.)
- Per-package name = `@harness-engineering/<dir>`; per-package `test:coverage` = `vitest run --coverage`.

## Uncertainties

- [ASSUMPTION] The vitest `json` reporter emits the jest-compatible shape (`testResults[].{name,status,message,assertionResults[].{status,title,ancestorTitles,failureMessages}}`). The summarizer reads defensively (optional chaining + suite-level fallback), so minor shape drift degrades to a partial summary rather than a crash. If the shape differs materially, only Task 2's `extractFailures` needs revision. _Confirmed empirically in Task 8 against a real forced-failure report before final sign-off._
- [DEFERRABLE] Exact wording/box-drawing of the summary header. Cosmetic; finalized in Task 2.
- [ASSUMPTION] Node 22's `fs.readdirSync` discovery (not `fs.globSync`) is used to avoid any minor-version glob-stability question. Zero dependency risk.

## Skeleton

_Not produced — this is `standard` rigor with 9 tasks (< 8 threshold is for skipping; 9 is close but the work is mechanical and the file map is fully enumerated). Full tasks follow directly._

---

## Tasks

The full task-by-task breakdown (9 tasks across 5 dependency waves) is preserved in the session record; each task is TDD where it produces code (Tasks 1–2), config wiring is split into three 4-package groups (Tasks 4–6) to respect the file-count bound, the hook edit (Task 7) is verified with `dash -n` + a forced-failure e2e, Task 8 is the `[checkpoint:human-verify]` real-push gate, and Task 9 is the final gate checklist (format / generate:plugin:check / changeset / baselines byte-identical). Every spec success criterion SC1–SC5 is traced to a verifying task in the checklist below.

## Dependency graph / sequencing

- **Wave 1 (parallel):** Task 1, Task 2, Task 3 — independent files.
- **Wave 2 (parallel):** Task 4, Task 5, Task 6 — each depends on Task 1 (+ Task 3); disjoint config files.
- **Wave 3:** Task 7 — depends on Task 2 + Task 4/5/6.
- **Wave 4:** Task 8 — depends on Task 7 (contains the human-verify checkpoint).
- **Wave 5:** Task 9 — final gate, depends on all.

## Final verification checklist → spec success criteria

| #     | Spec success criterion                                                                 | Verified by                                                                               |
| ----- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| SC1   | Failure prints package + title + file + first line even with no `FAIL` line            | Task 2 (unit `extractFailures`/`formatSummary`) + Task 8 step 2 (real forced-failure e2e) |
| SC2   | Passing run → summarizer not invoked, output unchanged                                 | Task 7 (`if ! ...` guard) + Task 8 step 6 (human happy-path)                              |
| SC3   | No flag → no report, byte-identical behavior                                           | Task 1 (helper returns `{}`) + Task 4–6 flag-off checks + Task 8 step 4 + green CI        |
| SC4   | No reports on failure → honest line, still `exit 1`                                    | Task 2 (empty-case unit) + Task 7 (`exit 1` outside summarizer) + Task 8 step 3           |
| SC5   | Edited hook still allows a happy-path push (valid POSIX sh, `set -e`)                  | Task 7 (`dash -n`/`sh -n`, no-bashism grep) + Task 8 step 6 (real push)                   |
| Gates | format clean; `generate:plugin:check` 0; no changeset needed; baselines byte-identical | Task 9                                                                                    |
