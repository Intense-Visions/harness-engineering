# Spec: Make pre-commit skipped checks visible

**Status:** approved (autonomous — single-phase, low-complexity)
**Roadmap:** #529 (`Audit and cap the pre-commit --skip list`)
**Keywords:** pre-commit, ci-check, skip-list, visibility, stderr, fail-closed

## Problem

`.husky/pre-commit` runs `harness ci check --skip entropy,docs,perf,security,deps,phase-gate`
(line 27). Six check categories are **silently** disabled at commit time. Each skip may be
individually justified (the checks are slow, or run later at pre-push), but the _cumulative
silence_ is the failure pattern the roadmap item cites: "every gap was once a known issue.
Then it became background noise. Then it became invisible." A developer committing has no
signal that six categories of guardrail are inactive.

### Boundary

- **In scope:** make the six skips _visibly named_ at commit time.
- **Out of scope:** re-enabling any skipped check, moving checks to pre-push, or changing the
  `--skip` set. Visibility only — behavior of the checks themselves is unchanged.

## Approaches considered

|            | A) One stderr warning line per skipped category                   | B) Move slow checks to pre-push, drop the skip                    | C) Single summary warning naming all six                                                           |
| ---------- | ----------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **How**    | For each skipped category, `echo "…" >&2` before the ci-check run | Delete `--skip`, add the categories to the pre-push gauntlet      | One `echo` listing all six categories                                                              |
| **Pros**   | Each gap stays individually named; minimal, reversible            | Actually closes the gaps                                          | Least output noise                                                                                 |
| **Cons**   | Doesn't close the gaps (visibility only)                          | Large behavior change; slows every push; out of this item's scope | A blob is easier to stop reading than per-line names — weaker against the "invisible" failure mode |
| **Risk**   | Low                                                               | Medium–High                                                       | Low                                                                                                |
| **Effort** | Low                                                               | Medium                                                            | Low                                                                                                |

**Chosen: A.** The roadmap item explicitly frames this as a _visibility_ fix ("emit a
one-line stderr warning per skipped category so the gaps remain visibly named"), not a
re-enablement. Per-line naming is what defeats the "becomes invisible" pattern — a reader
scanning commit output sees each disabled gate by name. B is a real but separate decision
(behavior change) that YAGNI cuts from this scope. C loses the per-gate naming that is the point.

## User story

As a developer committing to this repo, I want each pre-commit check that is being skipped to
be named on stderr, so that the set of temporarily-disabled guardrails never silently grows
invisible.

## Success criteria (EARS)

1. WHEN the pre-commit hook runs, the system SHALL emit exactly one `stderr` line per category
   in the `--skip` list, each line naming that category.
2. The warnings SHALL go to `stderr` (`>&2`), never `stdout`, so piped/captured stdout is
   unaffected.
3. The system SHALL NOT change the `--skip` set, the `ci check` invocation, or the hook's
   exit behavior (a passing commit still passes; a blocked commit still blocks).
4. The skip list in the warnings SHALL stay in sync with the actual `--skip` argument (single
   source of truth — the warnings are derived from the same list, not a hand-copied duplicate
   that can drift).

## Implementation Order

### Phase 1: Emit per-category skip warnings <!-- complexity: low -->

Edit **only** `.husky/pre-commit`. Derive the category list from the `--skip` argument (one
source of truth) and, immediately before the `ci check` invocation, loop over it emitting one
`>&2` warning per category. No change to the `--skip` value, the `ci check` command, or exit
handling. Verify by running the hook and confirming six named warning lines on stderr and
unchanged pass/block behavior.

## Notes for the executor

- The hook is POSIX `sh` (may be dash under husky) — no bashisms (`set -o pipefail`, arrays).
  A `for cat in $(echo "$SKIP" | tr ',' ' ')` loop is portable.
- Keep the existing comments (the #726 tee-exit-code note is load-bearing documentation — do
  not delete it as collateral).
- Do not alter the file mode (it must stay executable, `100755`).
