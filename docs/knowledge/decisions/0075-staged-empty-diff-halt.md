---
number: 0075
title: Staged empty-diff halt extends the #843 trustworthiness invariant
date: 2026-07-17
status: accepted
tier: integration
source: docs/changes/trustworthy-staged-local-dispatch/proposal.md
---

## Context

#843 gave the **single-dispatch** local path a completes-or-halts guarantee: a
`local`/`pi`/`ollama` run that produced no workspace changes is halted before
`verify` with `no changes produced`, because an empty diff would trivially pass
typecheck/lint/test of an unchanged tree and be marked done. That guard lives in
`runLocalWorkflowGate` (`packages/orchestrator/src/orchestrator.ts:2620-2630`) and
reuses a constructor-injected `this.diffRunner` seam (`hasChanges`).

The **staged-workflow** path (`workflows:` in the config frontmatter) never got the
same guarantee. Its completion seam, `settleWorkflowSuccess`, marked a unit
`success → done` with NO diff check, so a staged local unit whose stages ran but
wrote nothing shipped as a hollow completion. This was the same trust gap #843
closed for single dispatch, just on the other completion path.

Two adjacent gaps in the same staged path compounded the problem:

1. **Execution-stage mis-route.** A no-`cognitiveMode` execution stage (a bare skill
   useCase) was routed through `AdaptiveRouter.route`, which handed
   `selectCheapestQualifying`'s tier-cheapest backend to `invocationOverride` and
   short-circuited `BackendRouter.resolve` step 1 — so the stage landed on the
   tier-picked reasoner instead of falling to `routing.default` (the per-phase
   execution backend). The wrong backend then ran the execution work.
2. **The LOCAL stage prompt said "run then stop."** `LOCAL_STAGE_PROMPT_TEMPLATE`
   told a local model to "Complete THIS stage's task, then stop" and "follow its
   output VERBATIM," which a weaker local model satisfied by reading the skill's
   instructions and stopping — producing exactly the empty diff above.

## Decision

**D1 — A staged local unit must produce a non-empty workspace diff or halt.**
`settleWorkflowSuccess` now diffs the unit's workspace before persisting success.
An empty diff routes the unit to the EXISTING terminal → `needs-human` escalation
(`settleWorkflowTerminal`) with the same `no changes produced — the agent completed
without implementing anything` reason #843 uses — never `persistLane('success')`.

**D2 — Reuse the #843 seam, scoped by the same locality predicate.** The staged
gate reads the same `this.diffRunner` (`hasChanges`) field and gates on
`isLocalEndpointBackend` applied to the **last stage's** routed backend
(`runs[runs.length-1].decision.backendName`). A non-local staged unit is
byte-identical to before — the check is a no-op off the local path (SC6).

**D3 — Fail OPEN.** A missing running entry / absent `workspacePath` / a throwing
`diffRunner` proceeds to success rather than halting a unit we cannot diff
(preserves the non-empty-diff path and the already-deleted-entry race). The gate
runs BEFORE any state mutation in `settleWorkflowSuccess` so the terminal path still
sees the live running entry.

**D4 — Route bare execution stages to `routing.default`.** `AdaptiveRouter.route`
drops the `invocationOverride` for a bare execution stage — a `kind:'skill'`
useCase with no per-skill/per-mode binding (`BackendRouter.wouldFallToDefault`) AND
no explicit `routingHint` (`req.complexity` absent) — so it resolves through the
normal chain to `routing.default`. AMR tier selection is preserved for
tier/intelligence useCases, per-skill overrides, design stages (bound
`cognitiveMode`), and any explicitly hinted stage.

**D5 — Drive the LOCAL stage prompt to PRODUCE.** `LOCAL_STAGE_PROMPT_TEMPLATE` now
tells the model to do the work to completion and PRODUCE its declared output
(`produces`, threaded into both templates), and explicitly that reading the
instructions is not completing the stage. The prior-stage `<<<BEGIN>>>/<<<END>>>`
data-fencing is kept byte-identical (prompt-injection guard).

## Consequences

- The staged path now carries the same trustworthiness invariant as single
  dispatch: a local unit either produces a non-empty diff or halts visibly, instead
  of being marked `success → done` on a hollow completion.
- **This is a _completion_ guard, not a quality one.** It stops "ran but wrote
  nothing" completions; judging whether real changes satisfy the spec remains the
  outcome-eval gate's job. It does not — and is not meant to — improve the local
  model's design ability; the model's design weakness is out of scope.
- **Single-dispatch and non-local paths are byte-identical.** The staged gate is a
  separate check in `settleWorkflowSuccess`; `runLocalWorkflowGate`
  (`:2620-2630`), its tests (`orchestrator.local-gate.test.ts:342-378`), and the
  `workflowGates` read site are untouched (SC6).
- The routing fix (D4) and prompt drive (D5) reduce how often the empty-diff halt
  fires in practice — the execution stage now runs on the intended backend with a
  prompt that drives production — but the halt remains the backstop.

## Alternatives rejected

- **A new gate mechanism for the staged path.** The `diffRunner`/`hasChanges` seam
  and the `settleWorkflowTerminal` → `needs-human` escalation already exist; a
  parallel mechanism would fork the trust guarantee and its tests. Rejected in favor
  of reusing both (D1/D2/D3).
- **Fixing the mis-route in `buildStageRequest`.** The mis-route is in
  `AdaptiveRouter.route`'s `invocationOverride` handoff, not in useCase derivation;
  the failing test reproduced it through `route()`, so the fix lands there (D4).
- **Halting a unit we cannot diff.** Failing closed on a missing workspace/entry or
  a diff error would block legitimately-complete units on transient IO faults;
  fail-open preserves the non-empty-diff path (D3).
