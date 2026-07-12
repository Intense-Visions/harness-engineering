---
number: 0066
title: A mid-workflow runner error is terminal, not a whole-issue retry
date: 2026-07-11
status: accepted
tier: medium
source: docs/changes/split-routing/proposal.md
---

## Context

Split-routing runs a coherence unit's stages sequentially on **one shared
worktree** — later stages consume the artifacts produced by earlier stages
(`produces`→`expects`, D4). This is the key difference from the pre-split,
single-agent issue model.

The pre-split orchestrator handled a runner/transport error by re-entering the
whole-issue retry path (`enqueueRetry`), which re-runs the issue **from the
beginning**. For a single-agent issue that is fine — there is nothing to lose. But
for a multi-stage workflow it is catastrophic: the whole-issue retry calls
`ensureWorkspace`, which **wipes and re-creates the shared worktree**, destroying
every prior stage's committed artifacts. A transport blip during stage 3 of a
5-stage workflow would silently throw away stages 0–2's work and restart from
stage 0 — wasted tokens, lost intermediate state, and a confusing non-local
failure (D10).

## Decision

A runner **throw** mid-stage (transport/runner error) is **terminal for the unit**,
attributed to the failing stage — never a retry, never a restart-from-stage-0
(D10):

- `runStageWithRetry` wraps each attempt's `runStageSession` in `try/catch`. On a
  throw it builds a `StageRun` with `outcome:'error'` for **that** stage and
  returns it immediately (no engine retry on transport errors — the retry cap is
  for quality failures, not transport).
- `executeWorkflow`'s `outcome !== 'pass'` branch then drives
  `finalizeWorkflowTerminal(unit, runs, failingStep)` exactly once. The `runs`
  payload still contains the **completed** prior-stage `StageRun`s (their artifacts
  on the shared worktree are preserved — not wiped), and the failing stage carries
  `outcome:'error'` with its `failingStep`.
- The pre-existing top-level `catch` in `executeWorkflow` remains as the I1
  last-resort safety net (e.g. a throw from `finalizeWorkflowTerminal` itself),
  preserving the D6/SC5 single-exit guarantee: exactly one terminal transition and
  no orphaned `running`/`claimed` on every path.
- `finalizeWorkflowTerminal` includes `cleanWorkspace` (S5) — the terminal path
  cleans the worktree deliberately and once, rather than an in-flight retry
  wiping it mid-workflow.

## Consequences

- A transport error mid-workflow no longer destroys prior-stage artifacts or
  re-runs from stage 0 (observable: stage 0 runs exactly once; the errored stage
  carries `outcome:'error'`; downstream stages never run).
- The unit escalates to a human once, with the failing stage attributed — a
  steward can inspect the preserved artifacts.
- **Follow-up:** stage-local retry-in-place (resume the failed stage on the same
  worktree without a full restart) is deliberately out of scope here. v1 goes
  terminal-to-human; a future phase may add bounded in-place resume for transient
  transport errors.
- The issue-grain stall detection (`state-machine.ts:736`) is bypassed for workflow
  units — per-stage liveness is owned inside the engine by the D12 deadline
  (ADR 0065's sibling). Wiring that bypass at dispatch is Phase 4.

## Links

- Spec: `docs/changes/split-routing/proposal.md` (rev-2, D10, SC6-b)
- Plan: `docs/changes/split-routing/plans/2026-07-11-phase-3-failure-escalation-plan.md`
- Engine: `packages/orchestrator/src/workflow/execute-workflow.ts`
  (`runStageWithRetry` catch → `outcome:'error'`; `executeWorkflow` terminal branch)
- Related: ADR 0065 (separated failure mechanisms — D8)
