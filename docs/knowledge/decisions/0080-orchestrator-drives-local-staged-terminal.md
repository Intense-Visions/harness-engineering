# 0080 — The orchestrator drives an autonomous-local staged unit to a terminal

- **Status:** Accepted
- **Date:** 2026-07-18
- **Context tags:** orchestrator, staged-workflow, lane-lifecycle, ship, needs-human, convergence, local-model, autonomous

## Context

The orchestrator lane mapping encodes a **human-review** completion model: `success → in_review`, and "the orchestrator NEVER drives `done`" — `done` needs a merged PR carrying test/PR evidence, i.e. a human reviewer. That is correct for a primary/Claude unit, which opens a PR a human reviews and merges.

It is wrong for an **autonomous local** staged unit, which has no reviewer in the loop. Under the human-review model such a unit:

- On success mapped to `in_review`, but nothing shipped a PR (the weak local model usually skips push+PR — LESSONS.md #874), so the roadmap row stayed `in-progress` (`done` needs a merged PR that never happens). The next tick re-selected the row and re-dispatched; the re-claim hit `in_review → claimed not allowed` (a warning; dispatch proceeded anyway), the workspace was wiped, the work rebuilt, "completed all stages", `in_review`, wiped — **forever**.

So the unit could never terminalize: no ship to reach `done`, no re-claimable failure lane to converge, and no bounded escalation to stop the loop.

## Decision

The orchestrator MAY drive a **local** staged unit all the way to a terminal, without a human PR review, via two ends of the convergence loop [ADR 0079](0079-staged-settle-reuses-single-dispatch-gate.md) gates:

**Gate FAIL → `failure` → `blocked` → re-claim (converge).** The gate-fail branch preserves the workspace (no `cleanWorkspaceWithGuard`, no `persistLane('success')`), stashes the failure reason for the next prompt, and re-dispatches through the SAME `emitWorkerExit('error')` seam single-dispatch uses. That persists lane `failure` (→ `blocked`). Critically, the lane machine (`lane-machine.ts:23-32`) allows `blocked → claimed` (blocked returns to any non-terminal lane), so the retry **actually re-claims and re-dispatches** — this is what breaks the old `in_review → claimed`-forbidden stuck loop. #890's preserved worktree lets work accumulate across attempts. Bounded to `maxLocalStageRetries` (default 5) consecutive failures.

**Bounded exhaustion → `needs-human` terminal (stop).** At the bound, `settleWorkflowTerminal` clears `running`/`claimed`, escalates exactly one `needs-human` interaction, and persists lane `abandon` (→ `canceled`, a terminal lane with no outgoing transitions). It does NOT re-add the unit to `state.completed` — a needs-human terminal is not a completion. The tick stops re-selecting because the escalation drives the row non-active (and `canceled` is terminal), not via a completed lock.

**Gate PASS → deterministic ship → `in_review` → (PR-merge) → `done` (stop).** On a green gate the orchestrator SHIPS deterministically — `shipWorkspace` commits the accumulated work, pushes an `orchestrator/<identifier>` branch, and opens a PR — BEFORE the existing success finalize, so `cleanWorkspaceWithGuard` finds the pushed branch + PR and takes its preserve/record path. The unit then runs the reducer normal-exit sequence inline (`running.delete → completed.set → claimed.delete`) and persists lane `success` (→ `in_review`). The PR merging auto-dones the row (→ `done`). A ship FAILURE is a BLOCK, not a hollow success — it routes through the SAME preserve+retry seam as a gate failure. The `state.completed` record is the SAME guard the single-dispatch normal-exit uses to prevent the still-`in-progress`, `in_review` row from being **re-dispatched (double-shipped)** before its PR merges.

The primary/non-local mapping is untouched: `success → in_review` human-review semantics remain for any unit whose last stage is not a local-endpoint backend.

## Alternatives considered

- **Add an `in_review → claimed` transition to make the re-dispatch legal.** Rejected: it papers over the loop rather than terminalizing it — a successful-but-unshipped unit would still re-dispatch and re-wipe forever, just without the warning. The fix is to make success actually SHIP (reach a terminal) and to route failures to a re-claimable `blocked`, not to loosen `in_review`.
- **An agent-driven ship stage (ask the local model to push + open the PR).** Rejected: weak local models unreliably push/PR (#874 needed a driver-level completion loop). An orchestrator-side ship is deterministic.
- **Let the row stay `in-progress` and rely on the model to converge.** Rejected: this is the pre-fix behavior — no bound, no ship, no terminal.

## Consequences

- A local staged unit on a simple item converges: accumulate across preserved-workspace retries until the acceptance gate passes → ship (PR → auto-done); on repeated failure → `needs-human` after a bounded number of attempts. No infinite hollow-success/wipe/stuck-lane loop.
- The `state.completed` record makes the ship path inherit the single-dispatch double-ship guard for free — a just-shipped `in_review` unit is not re-selected while its PR is in flight.
- The orchestrator now writes `done`-adjacent state (`in_review` + a real PR) for local units autonomously; the human role narrows to merging/steering the PR and clearing `needs-human` escalations, not gating every completion.
- Non-local/primary staged and single-dispatch lane lifecycles are unchanged.
