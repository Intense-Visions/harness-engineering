# Reference: packages / orchestrator / 5

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/orchestrator/src/core/budget-governor.ts

[`packages/orchestrator/src/core/budget-governor.ts`](/packages/orchestrator/src/core/budget-governor.ts)

Budget governor for unattended dispatch (#1525): pure functions over a per-period token spend envelope (global and per-fleet allocations) that refuse a NEW dispatch once the envelope is spent while never touching in-flight lanes; off when no budget config is set.

**Exports:** `resolvePeriodLengthMs`, `periodLengthMs`, `BudgetState`, `createBudgetState`, `cloneBudgetState`, `rollBudgetPeriod`, `fleetKeyForIssue`, `recordBudgetSpend`, `isGlobalEnvelopeExhausted`, `isFleetAllocationExhausted`, `canAffordDispatch`, `getBudgetStatus`

## packages/orchestrator/src/core/context-budget-governor.ts

[`packages/orchestrator/src/core/context-budget-governor.ts`](/packages/orchestrator/src/core/context-budget-governor.ts)

Live enforcement seam for the per-leaf context-replay budget (#1524): estimates an issue's in-memory context tokens from its title and description and consults core's `assertLeafWithinBudget` before a leaf is dispatched; a no-op when `agent.contextBudget` is not configured.

**Exports:** `estimateIssueContextTokens`, `buildLeafContextEstimate`, `assertIssueWithinContextBudget`

## packages/orchestrator/src/core/flight-recorder.ts

[`packages/orchestrator/src/core/flight-recorder.ts`](/packages/orchestrator/src/core/flight-recorder.ts)

Orchestrator flight recorder (black-box): a best-effort, never-throwing forensic record of one orchestrator run, capturing provenance (git HEAD, node and harness versions, resolved backends and routing) and each unit's terminal verdict with its gate reason, written to `black-box/<runId>/run.json` and readable statically by the CLI.

**Exports:** `ProvenanceBackend`, `RunProvenance`, `Verdict`, `UnitVerdict`, `RunRecord`, `gatherProvenance`, `FlightRecorder`

## packages/orchestrator/src/gateway/webhooks/waypoint-bridge.ts

[`packages/orchestrator/src/gateway/webhooks/waypoint-bridge.ts`](/packages/orchestrator/src/gateway/webhooks/waypoint-bridge.ts)

Opt-in Waypoint bridge that republishes every successfully spooled `sdlc.*` event onto the orchestrator event bus under its own pinned type, so the existing webhook fan-out delivers it; a no-op returning a no-op teardown when no `waypoint.sink` is configured.

**Exports:** `wireWaypointSdlcBridge`

## packages/orchestrator/src/maintenance/triage-task.ts

[`packages/orchestrator/src/maintenance/triage-task.ts`](/packages/orchestrator/src/maintenance/triage-task.ts)

Roadmap Auto-Triage scheduling seam: registers a leader-gated triage job on the existing maintenance substrate (dormant unless enabled with a schedule) with an injected job body, plus an explicit leader gate for the on-demand path.

**Exports:** `TRIAGE_TASK_ID`, `TriageJobBody`, `RegisteredTriageTask`, `registerTriageTask`, `runTriageIfLeader`

## packages/orchestrator/src/proposals/model-handlers.ts

[`packages/orchestrator/src/proposals/model-handlers.ts`](/packages/orchestrator/src/proposals/model-handlers.ts)

Model-proposal lifecycle handlers (LMLM Phase 5b): approve drives install, swap, or evict through the pool manager (deferring eviction of an in-use model and forwarding install progress on the bus), reject records the decision for future suppression, a stale upstream target is marked `failed_target_missing` without touching the pool, and in-flight installs can be re-driven.

**Exports:** `ModelPoolOps`, `ModelProposalPatch`, `ModelHandlerDeps`, `MODEL_PROPOSAL_TOPIC`, `MODEL_POOL_TOPIC`, `MODEL_INSTALL_TOPIC`, `InstallProgressForwarder`, `makeInstallProgressForwarder`, `ModelApproveOutcome`, `onApproveModelProposal`, `onRejectModelProposal`, `redriveInstallingProposals`

## packages/orchestrator/src/workflow/execute-workflow.ts

[`packages/orchestrator/src/workflow/execute-workflow.ts`](/packages/orchestrator/src/workflow/execute-workflow.ts)

Staged (split-routing) workflow engine: executes a multi-stage plan's stages sequentially on one worktree, each as its own routed session with a per-stage deadline (longer for local backends) and stage-attempt key; a `pass-required` stage that fails its quality gate is retried exactly once at a bumped tier, and every exit path drives exactly one terminal transition.

**Exports:** `nextTier`, `DEFAULT_STAGE_DEADLINE_MS`, `LOCAL_STAGE_DEADLINE_MS`, `LOCAL_DOCUMENT_STAGE_DEADLINE_MS`, `WorkflowEngineContext`, `stageAttemptKey`, `buildStageRequest`, `runStageSession`, `runStageWithRetry`, `executeWorkflow`

## packages/orchestrator/src/workflow/gate-feedback.ts

[`packages/orchestrator/src/workflow/gate-feedback.ts`](/packages/orchestrator/src/workflow/gate-feedback.ts)

Gate-failure feedback distillation for retry prompts (#931): extracts the failure-relevant regions of typecheck, lint, and test output (tsc errors, failing tests with their assertion diffs, lint errors, trailing summary) instead of a head-plus-tail slice, falling back to truncation when no failure markers are recognized.

**Exports:** `truncateGateOutput`, `distillGateFailure`

## packages/orchestrator/src/workflow/local-stage-prompt.ts

[`packages/orchestrator/src/workflow/local-stage-prompt.ts`](/packages/orchestrator/src/workflow/local-stage-prompt.ts)

LOCAL-aware per-stage prompt template for on-device backends: runs the stage's skill via `harness skill run <skill> --autonomous` with the namespaced `harness__*` MCP toolset and ecosystem-aware self-verify commands, plus helpers that select the template and the stage persona system prompt.

**Exports:** `LOCAL_STAGE_PROMPT_TEMPLATE`, `selectStagePromptTemplate`, `stagePersonaSystemPrompt`

## packages/orchestrator/src/workflow/peer-unload.ts

[`packages/orchestrator/src/workflow/peer-unload.ts`](/packages/orchestrator/src/workflow/peer-unload.ts)

Peer-model unload for the reasoner unstick advisory: resolves the Ollama `/api/generate` URL and coder model to unload (via `keep_alive: 0`) so the reasoner can load on a single-GPU box without contending with the still-resident coder.

**Exports:** `resolvePeerUnloadTarget`, `PeerUnloadConfig`, `resolvePeerUnloadFromConfig`

## packages/orchestrator/src/workflow/stage-prompt-template.ts

[`packages/orchestrator/src/workflow/stage-prompt-template.ts`](/packages/orchestrator/src/workflow/stage-prompt-template.ts)

Default per-stage LiquidJS prompt template for split-routing workflows, framing one stage of a multi-stage run with the work item, the stage's skill and declared output, optional pre-warmed comprehension units, prior-stage outputs, and a graph-scoped retrieval directive.

**Exports:** `STAGE_PROMPT_TEMPLATE`

## packages/orchestrator/src/workflow/unstick-advisory.ts

[`packages/orchestrator/src/workflow/unstick-advisory.ts`](/packages/orchestrator/src/workflow/unstick-advisory.ts)

Reasoner unstick advisory (pure core): decides when a local executor that keeps failing the enforced gate should be escalated, builds the reasoner prompt and structured response schema for a diagnosis plus concrete fix, and formats that advice for the coder's next retry.

**Exports:** `UNSTICK_SCHEMA`, `UnstickAdvice`, `UNSTICK_SYSTEM_PROMPT`, `DEFAULT_REASONER_ASSIST_AFTER`, `REASONER_UNSTICK_TIMEOUT_MS`, `shouldRequestUnstickAdvice`, `buildUnstickPrompt`, `formatUnstickAdvisory`

## packages/orchestrator/src/workflow/workflow-for.ts

[`packages/orchestrator/src/workflow/workflow-for.ts`](/packages/orchestrator/src/workflow/workflow-for.ts)

Pure split-routing matcher: returns the execution plan (plus the matched declaration's optional per-stage deadline and acceptance command) for the first `agent.workflows` declaration whose identifier prefix and labels match an issue and that has at least two stages, otherwise `undefined`.

**Exports:** `WorkflowMatch`, `workflowFor`

## packages/orchestrator/src/workspace/ecosystem.ts

[`packages/orchestrator/src/workspace/ecosystem.ts`](/packages/orchestrator/src/workspace/ecosystem.ts)

Language-aware workspace ecosystem detector: from the lockfiles and manifests at a workspace root, returns the ecosystem's dependency-install command and ordered verify command set from one declarative rule table, so the enforced gate and bootstrap are not hardcoded to pnpm.

**Exports:** `EcosystemId`, `Ecosystem`, `ECOSYSTEM_RULES`, `detectEcosystemFromFiles`, `detectEcosystem`
