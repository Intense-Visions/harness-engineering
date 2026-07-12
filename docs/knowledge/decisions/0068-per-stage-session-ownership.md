---
number: 0068
title: The engine owns per-stage session/recorder/abort/tokens (not the issue)
date: 2026-07-11
status: accepted
tier: medium
source: docs/changes/split-routing/proposal.md
---

## Context

Before split-routing, the orchestrator keyed an agent session, its stream
recording, its abort controller, and its token accrual **1:1 to the issue**: one
`RunningEntry.session`, one recorder attempt key `(issueId, attempt)`, one
issue-level abort. That model assumes one agent run per issue.

A staged workflow runs **N stages** on one coherence unit. Under the rev-1
issue-keyed model:

- **Recordings clobber.** N stages writing to `streams/{issueId}/{attempt}.jsonl`
  overwrite each other — the recorder has no stage dimension.
- **Per-stage tokens are lost.** A single issue-level token total cannot attribute
  cost to the stage that spent it, defeating split-routing's whole point (cheap
  stages route cheap, expensive stages route strong — you must be able to _see_
  that per stage).
- **The single abort races.** One issue-level `AbortController` shared across
  stages means aborting stage 2 could tear down stage 1's cleanup, or a stale
  abort from a prior stage could kill the current one.

## Decision

The **engine owns per-stage** session, recorder key, abort controller, and token
accrual — keyed by `stageAttemptKey(stageIndex, attempt)` (a collision-free
`stageIndex * 1000 + attempt` encoding, asserted `0 <= attempt < 1000`). The
issue-level `RunningEntry.session` field is **never written by a stage**
(`execute-workflow.ts` captures each stage's own `sessionId` from the runner's
`TurnResult` return, into `StageRun.sessionId`).

Concretely, per stage the engine uses:

- a **per-stage recorder** at `stageAttemptKey(index, attempt)`, so N stages
  produce N distinct `streams/{issueId}/{key}.jsonl` recordings that never clobber;
- a **per-stage `AbortController`** (never `this.abortControllers`), so one stage's
  deadline/abort cannot tear down another;
- **per-stage token accrual** summed off the yielded `usage` events into
  `StageRun.tokens`, so split-routing cost is attributable stage-by-stage.

## Consequences

- Per-stage cost is attributable — the split-routing cost story is observable.
- Stage recordings never overwrite each other; each stage has its own stream.
- No shared-abort race between stages.
- The **real** `WorkflowEngineContext` (Phase 4, `buildWorkflowContext`) preserves
  this by construction: it does NOT route terminal success through
  `emitWorkerExit`/`handleWorkerExit`, which would fire the **issue-keyed**
  `finishRecording(issueId, attempt)` + `recordAmrOutcome` — a double-fire, since
  the engine already ran the per-stage recorders and per-stage `recordOutcome`.
  Success is settled by hand from the `worker_exit`/normal reducer sequence,
  keeping the per-stage ownership intact (see ADR 0065 and the Phase-4 plan's SC5
  hazard).
- `stageAttemptKey`'s `attempt < 1000` assertion fails loud if a future retry-cap
  change spills the attempt band into the next stage's key range.

## Links

- Spec: `docs/changes/split-routing/proposal.md` (rev-2)
- Plan: `docs/changes/split-routing/plans/2026-07-11-phase-4-optin-producer-wiring-plan.md`
- Related: ADR 0067 (orchestrator homing), ADR 0065 (separated failure mechanisms)
