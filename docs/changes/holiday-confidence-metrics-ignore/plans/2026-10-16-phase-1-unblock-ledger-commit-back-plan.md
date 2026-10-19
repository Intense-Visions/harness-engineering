# Plan: Holiday Confidence Tracker — Phase 1: Unblock the trend-ledger commit-back

**Date:** 2026-10-16 | **Issue:** [#2223](https://github.com/chadjw/harness-engineering/issues/2223) | **Pipeline:** `harness-debugging` (4-phase) | **Tasks:** 3 | **Checkpoints:** 0 | **Integration Tier:** small | **Rigor:** standard

Session: `.harness/debug/active/2223-holiday-confidence-metrics-ignore.md` (moved to `resolved/` on close). Branch: `fix/2223-holiday-confidence-metrics-ignore`, built from `origin/main` at `676a22c79`. Worktree: `hd-cicd-unblock`.

## Symptom

`Holiday Confidence Tracker` → `track`: 3/3 red, zero successes since the workflow's abstain-guard fix landed.

| Run           | Date       | Conclusion |
| ------------- | ---------- | ---------- |
| `38280530888` | 2026-10-12 | failure    |
| `37339660254` | 2026-10-05 | failure    |
| `36446051707` | 2026-09-28 | failure    |

Step `Commit the trend ledger`, from the run log of `38280530888`:

```
The following paths are ignored by one of your .gitignore files:
.harness/metrics
hint: Use -f if you really want to add them.
##[error]Process completed with exit code 1.
```

## Phase 1 — INVESTIGATE

The `git add "$LEDGER"` at `.github/workflows/holiday-confidence-track.yml:166` exits 1 because the ledger path is ignored. Reproduced at the base SHA:

```
$ git check-ignore -v --no-index .harness/metrics/holiday-confidence.jsonl
.harness/.gitignore:56:metrics/	.harness/metrics/holiday-confidence.jsonl
```

`--no-index` is **required** to observe this. The ledger is a tracked file and plain `check-ignore` skips indexed paths, so the defect reads clean at a developer's desk and surfaces only in CI — where the file is being freshly appended and re-staged. That asymmetry is why the rule survived review twice.

`.harness/.gitignore` carries a deliberate un-ignore pair at lines 28-29 (`metrics/*` then `!metrics/holiday-confidence.jsonl`) plus a prose warning at line 24 against re-adding a bare `metrics/` rule. Line 56 — the file's last line — was exactly that bare rule.

**Provenance.** `git log -S'metrics/' -- .harness/.gitignore` shows two introductions of the bare rule: `9e2b9b46d` (first) and `4ef72cb82` (#2190, second, 2026-09-23). The latter's own commit message names it as incidental: a "chore: local tooling config" change rolled into an unrelated waypoint fix, listing "`.harness/metrics/` ignored alongside the other generated runtime artifacts". The author was ignoring untracked local telemetry and did not see the existing block. The first failing run (2026-09-28) is the first scheduled Monday after that merge.

The workflow's `if [ ! -f "$LEDGER" ]` abstain guard (line 159) is present and working correctly: the ledger file exists, so the KPI computed fine and its record was staged, refused, and discarded. **Not** touched by this plan.

## Phase 2 — ANALYZE

Working reference in the same file: `security/*` + `!security/timeline.json` (lines 49-50), the precedent the metrics block's own comment cites. It resolves correctly:

```
$ git check-ignore -v --no-index .harness/security/timeline.json
.harness/.gitignore:50:!security/timeline.json	.harness/security/timeline.json
```

The single structural difference between the working and failing blocks is the extra bare directory-suffix rule. A repo-wide scan of all 8 tracked `.gitignore` files for a directory rule shadowing a sibling negation found **exactly one** instance — this one. No other latent occurrence of the defect class.

Incidental discovery: the **root** `.gitignore:66-67` carries an independent second copy of the same contract (`**/.harness/metrics/*` + `!**/.harness/metrics/holiday-confidence.jsonl`). The telemetry half is therefore defended in depth, but the deeper `.harness/.gitignore` takes precedence for the ledger, so the bare rule there still won. Deduplicating the two copies is out of scope.

## Phase 3 — HYPOTHESIZE

**Hypothesis.** The bare `metrics/` rule defeats the negation through git's directory-suffix semantics (git does not descend into an excluded directory, so no rule inside it can re-include), _not_ through last-match-wins ordering. If that is right, relocating the rule above the pair changes nothing, and only deleting it restores the ledger.

Falsifiable prediction: a reordering probe stays broken.

Tested in a throwaway repo, four ignore-file variants against the same two paths:

| Probe | Ignore content                                    | ledger        | adoption.jsonl |
| ----- | ------------------------------------------------- | ------------- | -------------- |
| A     | pair only (intended state)                        | **stageable** | ignored        |
| B     | pair, then bare `metrics/` (current broken state) | ignored       | ignored        |
| C     | bare `metrics/` first, then pair (ordering probe) | ignored       | ignored        |
| D     | bare `metrics/`, `!metrics/`, then pair           | **stageable** | ignored        |

**Confirmed.** Probe C refutes the ordering explanation — moving the rule earlier does not help, so reordering would have been an invalid fix. Probe A is the intended state and is exactly what is wanted. Probe D works but needs a redundant re-include; deletion (A) is the minimal correct fix.

## Phase 4 — FIX

### Observable Truths (Acceptance Criteria)

| #   | Truth (EARS)                                                                                                                                                | Verifying command                                                    | Task |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---- |
| T1  | `.harness/metrics/holiday-confidence.jsonl` shall not be ignored by git.                                                                                    | `git check-ignore -q --no-index <ledger>` → exit 1                   | 2    |
| T2  | `adoption.jsonl`, `skill-events.jsonl`, `refinement-events.jsonl`, `.adoption-cursor`, `.telemetry-cursor`, `published-analyses.json` shall remain ignored. | `git check-ignore -q --no-index <each>` → exit 0                     | 2    |
| T3  | `git add` on the ledger shall succeed, and on `adoption.jsonl` shall still be refused.                                                                      | `git add --dry-run` on each                                          | 2    |
| T4  | The diff to `.harness/.gitignore` shall delete exactly one line (`metrics/`) and leave lines 28-29 intact.                                                  | `git diff -- .harness/.gitignore`                                    | 2    |
| T5  | A regression guard shall FAIL with the stray rule present and PASS without it.                                                                              | revert-and-fail protocol, Task 1 + Task 3                            | 1, 3 |
| T6  | The guard shall also fail if the whole directory is un-ignored (the worse defect).                                                                          | vacuity probe removing both ignore layers                            | 1    |
| T7  | The full `@harness-engineering/cli` suite, typecheck and lint shall pass.                                                                                   | `pnpm --filter @harness-engineering/cli test` / `typecheck` / `lint` | 3    |
| T8  | CI shall be green on ubuntu, macOS and Windows.                                                                                                             | `gh pr checks`                                                       | 3    |

### Task 1 — Write the failing regression guard

`packages/cli/tests/ci/harness-metrics-ignore.test.ts`.

**Placement decision.** A vitest test in `packages/cli/tests/ci/`, not a `scripts/assert-*.mjs`. Rationale:

- The invariant is a **static property of a committed file**, fully resolvable by `git check-ignore` with no network, no auth and no live PR data. That is unit-testable.
- The existing `assert-*.mjs` idiom guards a **per-run diff**: `assert-diff-scope.mjs` is invoked from a workflow with `gh pr diff --name-only` piped into it (this very workflow does so at line 228). Wrong shape for a repo invariant — and it would need new workflow wiring to fire at all, which risks a `paths:`-gated check that never runs.
- `packages/cli/tests/ci/` already holds workflow-contract tests of exactly this shape (`roadmap-auto-done-workflow.test.ts`, the cited precedent), and the suite runs on all three OSes on every PR with no new wiring.

**Design decision.** The guard asserts **git's real ignore resolution**, not the text of the ignore file. A text assertion could not distinguish the legitimate `metrics/*` from the fatal `metrics/`, and — scoped to `.harness/.gitignore` — would miss a bare rule added to the root `.gitignore`. Asserting behaviour catches any future route to the same breakage.

Both halves are asserted: ledger stageable **and** six companion paths still ignored. Under `--no-index` `check-ignore` is pure pattern matching, so the companion paths need not exist on disk and the test stays hermetic.

### Task 2 — Delete the stray rule

Delete `.harness/.gitignore:56` (`metrics/`). Keep lines 28-29. Extend the line-24 prose warning to say _anywhere in this file_ (probe C), to record that this is the second recurrence, and to cite the new test so the next reader finds the mechanical guard.

### Task 3 — Verify

Revert-and-fail protocol, then full-suite + typecheck + lint, build the CLI before committing (pre-commit arch hook reads `packages/cli/dist`), then push and confirm all-OS CI.

## Uncertainties

- [RESOLVED → defect in the first draft of the guard] `git check-ignore` exit-code semantics differ between `-v` and plain. Without `-v`: 0 = ignored, 1 = not ignored. With `-v`: 0 means a rule **matched**, and a negation counts as a match — so `-v` exits **0** for `!metrics/holiday-confidence.jsonl`, i.e. 0 for a path that is _not_ ignored. The first draft keyed the verdict off `-v` and would have false-failed after the fix, inverting the answer for precisely the path the test exists to protect. The guard now takes its verdict from the plain exit status and uses `-v` only to name the winning rule in the failure message. Verified on git 2.54.0.
- [ASSUMPTION] A non-0/1 exit from `check-ignore` (notably 128) is a broken invocation, not a verdict. The guard throws rather than letting a non-answer read as "not ignored" and turn itself permanently green — this repo has a recurring defect class of tools that report success without running.
- [ASSUMPTION] `git` is on PATH in every test environment. 37 test files in this package already spawn `node`/`git` subprocesses, and CI checks out with `actions/checkout`.
- [DEFERRABLE] Root `.gitignore:66-67` duplicates the metrics contract. Harmless today and the behavioural guard covers either copy; deduplicating is not this fix.
- [OUT OF SCOPE] Issue #2088 reports a different defect in this same workflow — an unretried `gh pr merge --auto` near line 231. Untouched.
- [OUT OF SCOPE] The `Reconcile audit exceptions` check is red on every PR since 2026-10-05 (pre-existing, deferred away from this lane).

No blocking uncertainties.

## Evidence

- `.github/workflows/holiday-confidence-track.yml:143-171` — the `Commit the trend ledger` step and its `git add "$LEDGER"`.
- `.harness/.gitignore:22-29, 48-50` — the metrics block, its prose warning, and the working `security/timeline.json` precedent.
- `packages/cli/tests/ci/roadmap-auto-done-workflow.test.ts` — the cited workflow-behaviour-test precedent.
- `scripts/assert-diff-scope.mjs` — the per-run diff-guard idiom considered and rejected for this invariant.
- Run `38280530888` job log — the verbatim failure.
