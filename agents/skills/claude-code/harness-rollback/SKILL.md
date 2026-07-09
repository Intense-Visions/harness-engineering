# Harness Rollback

> Post-ship circuit breaker. Proposes a full-context **revert PR** when a shipped PR fails post-merge evaluation or crosses a signal threshold. v1 is **propose-only** — it NEVER auto-merges. A human merges the revert.

## When to Use

- When a merged PR is suspected of causing a regression and you want a considered, full-context revert prepared for review.
- When a tracked signal (error rate, a baseline count, any `.harness/signals/` series) crosses a threshold and you want the implicated PR(s) evaluated for rollback.
- As the manual entry point to the same engine the scheduled `rollback-propose` workflow drives automatically.
- NOT for reverting un-merged work (use `git`/`gh` directly).
- NOT for deployment/infrastructure rollback — this operates at the git/PR layer (it opens a revert PR), not at the deploy layer.
- NOT to auto-merge a revert. v1 does not have that authority (see Iron Law).

## Process

### Iron Law

**v1 never auto-merges a revert. It opens a revert PR and stops. A human decides.**

Auto-merging code — even a revert — is a high-blast-radius write, and a wrong revert is itself an incident. The trust model earns auto-merge authority only after the propose loop has demonstrably proposed _correct_ reverts over time (recorded via the `rollback_event` breadcrumb). Until then, the workflow carries `pull-requests: write` but **not** `contents: write` and **no** self-approving PAT. If you find yourself merging a revert automatically, STOP — that is a separate, deferred trust tier (see ADR 0063).

---

### Phase 1: RESOLVE — Identify the target

1. Take the target merged PR number (`--pr <n>`) and the trigger (`signal` or `eval`).
2. Resolve the PR's merge commit and changed files via `gh`. If the PR is **not merged** (no merge commit), stop with a structured `skipped` decision — there is nothing to revert.
3. Determine the merge shape: a two-parent merge commit reverts against parent 1 (`-m 1`); a **squash/rebase** merge is single-parent and reverts against its sole parent. This repo uses both — never assume a two-parent merge.

### Phase 2: CLASSIFY — Is it revert-ready?

Run `classifyRevert` (core). A target is **revert-ready** only when BOTH hold:

- **Clean revert** — an in-memory `git merge-tree --write-tree` of the revert applies with no conflicts. (Never a working-tree-mutating `git revert -n`.)
- **No dependent later merge** — no PR merged after the target touches the same files. A later dependent merge → `action: 'blocked'` (a naive revert would orphan newer work).

`blastRadius` and `migrationWarnings` are **context only, never gates** — they enrich the PR body so the human reviewer sees the stakes; they do not decide revert-readiness.

### Phase 3: COMPOSE — Open the revert PR (or dry-run)

1. If `--dry-run`, print the PR body and stop — open no PR.
2. Otherwise open a revert PR: title `revert: <original> (automated rollback)`, marker label `harness:rollback`, body = the full context block (trigger, target, revert-ready verdict, classification reasons, blast-radius, migration warnings, and the `--reason` if given).
3. **Idempotency:** if an open PR labeled `harness:rollback` already references the target (`#<n>`, word-boundary matched — `#42` must not match `#420`), skip — do not open a duplicate.

### Phase 4: RECORD — Breadcrumb

Append one `rollback_event` to `.harness/signals/`: `{ targetPr, trigger, revertReady, action, prUrl, reason, ts }`. This append-only record is what later justifies (or refuses) the auto-merge trust tier — it is not backfillable, so it is written on every evaluation.

---

## Triggers

- **Signal arm (live):** the scheduled `rollback-propose.yml` workflow runs `harness rollback sweep`, which reads `.harness/signals/timeline.json` and, for each `rollback.signals` entry `{ threshold, direction, window }`, detects an edge crossing, resolves the PR(s) merged in the window, and forwards each to `evaluate --trigger signal`.
- **Eval arm (dark until #31):** guarded by `rollback.evalTrigger.enabled` (default `false`). When outcome-eval is wired to run post-merge (#31), a high-confidence `NOT_SATISFIED` will route through the same engine with `--trigger eval`. Until then the path exists and is unit-tested but never fires — enabling it is a config flip, not a code change.

## Harness Integration

- **`harness rollback evaluate`** — the CLI core; classification + compose + breadcrumb for one target PR.
- **`harness rollback sweep`** — the signal arm; timeline threshold detection → `evaluate`.
- **`classifyRevert` / `RollbackDecision`** (`@harness-engineering/core`) — the pure, injected-IO classification engine.
- **`.github/workflows/rollback-propose.yml`** — propose-only post-merge + scheduled workflow. `contents: read` + `pull-requests: write`, concurrency-serialized, no self-approving PAT.
- **`harness.config.json` → `rollback`** — `signals` (record of `{ threshold, direction, window }`) and `evalTrigger.enabled`.
- **ADR 0063** — the post-ship rollback trust model (propose → auto-merge progression).

## Success Criteria

1. A revert PR is opened only for a revert-ready target (clean revert + no dependent later merge); non-clean/blocked/unmerged targets yield a structured `skipped`/`blocked` decision and no PR.
2. The revert PR body carries trigger, target, blast-radius, and migration warnings.
3. Re-running against the same target opens no duplicate PR (label + word-boundary idempotency).
4. Every evaluation appends one `rollback_event` breadcrumb.
5. No revert is auto-merged — a human merges the PR.
6. The eval arm produces no PR while `rollback.evalTrigger.enabled` is false.

## Gates

- **No auto-merge.** v1 opens PRs; it never merges them. Enforced by the workflow's minimal permissions (no `contents: write`, no self-approving PAT).
- **No revert without revert-ready classification.** A conflicting revert or a dependent later merge blocks the proposal.
- **No two-parent assumption.** Squash/rebase merges must revert against their sole parent.
- **No working-tree mutation.** Revert-readiness is tested in-memory (`merge-tree`), never with `git revert -n`.

## Rationalizations to Reject

| Rationalization                                                                   | Reality                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| "The eval clearly failed, so I should auto-merge the revert to stop the bleeding" | v1 has no auto-merge authority. Open the PR; a human merges. Auto-merge is a deferred trust tier (ADR 0063).                    |
| "`git revert -n` in a temp index is fine for the readiness check"                 | `-n` still writes the working tree. Use `git merge-tree --write-tree` — pure in-memory, no side effects.                        |
| "It's a merge commit, so `-m 1` is safe"                                          | Squash/rebase merges are single-parent; `-m 1` computes a meaningless revert. Check the parent count first.                     |
| "The signal fired, so every PR in the window should be reverted"                  | Only revert-ready targets are proposed, and only the human merges. A crossing is a signal to _evaluate_, not to revert blindly. |
