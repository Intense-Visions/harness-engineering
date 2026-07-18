# 0078 — Within-run retry reuses the worktree; restart wipes

- **Status:** Accepted
- **Date:** 2026-07-17
- **Context tags:** orchestrator, workspace, worktree, retry, dispatch, local-model-convergence

## Context

`WorkspaceManager.ensureWorkspace` unconditionally ran `git worktree remove --force` on any existing worktree at the start of **every** dispatch, then recreated it detached from the base ref. That guarantees an agent never works on stale code after an orchestrator **restart** — the documented reason the remove exists.

But the orchestrator retries a failed unit by **re-dispatching it**: when a staged unit fails verification, the tick loop re-selects the still-non-terminal unit and calls `dispatchIssue` again (`attempt null` each time — a fresh tick-driven dispatch, not an attempt-incrementing retry). Each re-dispatch called `ensureWorkspace`, which **wiped the worktree and all uncommitted partial progress**. The model redid everything from zero, failed again, and wiped again.

This was observed live (2026-07-17) across a local-model pilot: `qwen3-coder:30b` produced a test file in one pass, and the next re-dispatch deleted it; three re-dispatches / ~25 min with no convergence, for every reasoner tested. **A capable model that gets incrementally closer each pass can never accumulate to done** — the harness discards its work between retries. The failure is the workspace lifecycle, not model capability.

The fix must let a **within-run retry preserve** the worktree while a genuine **fresh dispatch / restart still wipes** — without regressing the anti-stale guarantee.

## Decision

Discriminate retry-from-fresh with an **in-memory, per-process `Set<identifier>` of units dispatched since process start** (`Orchestrator.#dispatchedThisRun`).

- On dispatch, `preserve = #dispatchedThisRun.has(identifier)`. `ensureWorkspace(identifier, { preserve })` returns the existing worktree untouched (`reused: true`) when `preserve` is true **and** a valid worktree exists; otherwise it runs the unchanged remove→add→seed flow (`reused: false`).
- The identifier is added to the set only **after** the dispatch clears the high-severity config-injection scan gate — a dispatch that aborts at the scan stays "fresh", so its next attempt wipes and recreates from base rather than reusing an un-vetted worktree. Create-only side effects (`afterCreate`, `seedWorkspace`) are skipped on reuse; `beforeRun` and the config-injection scan still run on **every** dispatch.

**Restart-correct by construction:** after a process restart the set is empty, so the first dispatch of any leftover worktree computes `preserve = false` and wipes — the anti-stale guarantee holds. Only the second-and-later dispatches of a unit _within the same run_ preserve.

## Alternatives considered

- **Lane-state flag (derive "isRetry" from the lane machine).** Rejected: reconciliation re-derives an `in_progress` lane on restart, so a post-restart first dispatch would look like a retry and wrongly preserve a stale worktree — reintroducing the exact bug the wipe prevents. The lane state machine is also brittle (canceled lanes cannot reset).
- **On-disk run-id sentinel in the worktree.** Equivalent semantics (a new process gets a new run-id → mismatch → wipe) but adds durable bookkeeping we do not need for this fix, and a sentinel file that must be kept out of git. Durability _across_ a restart is the separately-scoped phase-2 concern (commit partial work between stages + rebase), so an on-disk mechanism here would blur that boundary. Deferred.

## Consequences

- Verification-failure retries accumulate partial progress; the `#843`/`#886` empty-diff gate now sees a growing diff instead of a wiped-clean one.
- Reuse is intentionally **not** durable across an orchestrator restart — a restart wipes and restarts the unit from base. If that proves too lossy in practice, phase 2 (stage-commits + rebase) is the follow-up; it is gated on whether reuse-on-retry alone achieves convergence.
- Single-dispatch and unstaged workflow paths are unchanged (callers that pass no `opts` default `preserve` to false).
