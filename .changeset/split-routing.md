---
'@harness-engineering/orchestrator': minor
'@harness-engineering/types': minor
---

feat(split-routing): workflow stage-execution engine with per-stage AMR routing (AMR Phase 4b)

Adds split-routing — a declarative multi-stage workflow engine that runs a
coherence unit's stages sequentially on one worktree, routing each stage
independently through Adaptive Model Routing — behind a **doubly-opt-in,
default-off** gate. With no `>= 2`-stage workflow declared in `agent.workflows`
_and_ no `routing.policy` set, `dispatchIssue` is **byte-identical** to the shipped
single-agent path (SC4): `workflowFor` is a pure, side-effect-free matcher, so
calling it on every dispatch cannot change non-workflow behavior.

- **types**: additive `WorkflowStep` / `WorkflowExecutionPlan` / `StageRun`
  (per-stage `sessionId` + `tokens` for per-stage cost capture) and
  `StagedWorkflowDecl` / `WorkflowConfig.workflows` (the declarative producer with
  optional `match` grain and per-stage `stageDeadlineMs`). No existing type is
  widened.
- **orchestrator**: the `executeWorkflow` engine (`execute-workflow.ts`) driving
  `AgentRunner.runSession` per stage with engine-owned per-stage
  session/recorder/abort/tokens; per-stage `route()` sharing one `coherenceUnit`
  with a **cumulative** `EscalationState` floor; separated failure mechanisms
  (retry cap-1 at a bumped tier, mid-workflow transport error = terminal without
  wiping completed-stage artifacts, per-stage deadline); an atomic single-exit
  lifecycle guaranteeing exactly one claim / lane entry / terminal transition per
  unit for every exit path (all-pass, stage terminal-fail, engine throw) with no
  orphaned `running`/`claimed` (SC5). Live dispatch enters the engine only when a
  `>= 2`-stage workflow matches and a `routing.policy` is present; `workflowFor` is
  the single match authority (returns the plan plus the matched decl's
  `stageDeadlineMs`). `AdaptiveRouter` / `BackendRouter` remain byte-unchanged (SC8).

Per-stage prompt rendering and D4 `produces → expects` artifact-context threading
are **stubbed** in this phase — `runStageSession` passes the bare `step.skill` as
the prompt and `priorOutputs` returns `{}`, so stages currently operate off the
shared worktree file-state with a skill-name prompt. Real per-stage `PromptRenderer`
invocation + structured output threading, plus parallel stages, stage-local
retry-in-place, partial-resume, and rich auto-producers are follow-ups — see
`docs/changes/split-routing/proposal.md` "Deferred follow-ups". No behavior changes
for existing single-agent or single-stage configs.
