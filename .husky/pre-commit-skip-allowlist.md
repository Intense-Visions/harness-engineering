# Pre-commit `--skip` allowlist

`.husky/pre-commit` runs `harness ci check --skip "$SKIP"`. `$SKIP` is a **closed,
documented allowlist** of check categories that are deliberately deferred out of the
per-commit gate. This file is the reviewed source of that decision: it names every
skipped category, why it is deferred, and where it runs instead.

## Why this file exists (roadmap #529)

Deferring a slow check from commit-time is fine on its own. The failure mode is the
_cumulative silence_ — "every gap was once a known issue, then background noise, then
invisible." Two mechanisms keep the gaps named and the list capped:

1. **Visible at commit time.** The hook emits one `stderr` warning per skipped category,
   each carrying the rationale below, so a committer always sees which guardrails are
   inactive and why.
2. **Capped against silent growth.** `packages/cli/tests/hooks/pre-commit-skip-allowlist.test.ts`
   fails if the hook's `SKIP` set, its per-category rationale `case` arms, and the table
   below ever diverge. Adding a skip is therefore a visible, reviewed change across all
   three, never a silent one-token append to `SKIP`.

All six categories below run in CI via `harness ci check --skip arch`
(`.github/workflows/harness.yml`) — the mirror image of the local gate, which runs `arch`,
`validate`, and `traceability` and defers the rest. Between the two, every category runs
exactly once.

## Allowlist

| Category     | Where it runs instead                                | Why it is deferred from pre-commit                                                                                           |
| ------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `entropy`    | CI (`harness ci check`)                              | Drift & dead-code detection walks the whole dependency/knowledge graph — too slow to run on every commit.                    |
| `docs`       | CI (`harness ci check`) + PR doc-drift advisory      | Doc-drift analysis depends on graph state and is advisory-grade; the PR advisory job already surfaces it before merge.       |
| `perf`       | CI (`harness ci check`)                              | Complexity/coupling analysis is another full-graph walk, and its violations are already arch-baselined by the local gate.    |
| `security`   | CI (`harness ci check`) + security ledger            | The static security scan reads every source file in the tree — too slow per-commit; CI and the ledger cover it before merge. |
| `deps`       | CI (`harness ci check`)                              | Dependency / supply-chain health is slow and registry-facing — inappropriate for a fast local commit gate.                   |
| `phase-gate` | CI (`harness ci check`) + `harness check-phase-gate` | The spec↔implementation phase gate needs CLI-level phase context the fast local gate does not set up, and is phase-specific. |

## Changing the list

To add, remove, or rename a skip, edit **all three** in the same PR:

1. the `SKIP="..."` assignment in `.husky/pre-commit`,
2. the matching rationale `case` arm in `.husky/pre-commit` (`why=...`), and
3. the table row above (with a real rationale + where-it-runs-instead).

The allowlist test enforces that these three stay in sync, so the reviewer sees the gap
being named — that is the entire point of the cap.
