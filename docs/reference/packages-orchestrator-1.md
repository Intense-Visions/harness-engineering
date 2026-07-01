# Reference: packages / orchestrator / 1

Auto-generated reference index for previously-undocumented modules in this group. Each entry links the source file and summarizes its purpose and key exports.

## packages/orchestrator/src/agent/analysis-provider-factory.ts

[`packages/orchestrator/src/agent/analysis-provider-factory.ts`](/packages/orchestrator/src/agent/analysis-provider-factory.ts)

**Exports:** `IntelligenceLayer`, `ProviderFactoryLogger`, `ResolverStatusSnapshot`, `BuildAnalysisProviderArgs`, `buildAnalysisProvider`

## packages/orchestrator/src/agent/backend-factory.ts

[`packages/orchestrator/src/agent/backend-factory.ts`](/packages/orchestrator/src/agent/backend-factory.ts)

**Exports:** `CreateBackendOptions`, `createBackend`

## packages/orchestrator/src/agent/backend-resolver.ts

[`packages/orchestrator/src/agent/backend-resolver.ts`](/packages/orchestrator/src/agent/backend-resolver.ts)

Maintenance backend resolver: map a configured backend NAME to a live {@link AgentBackend}, or `null` when the name is absent from the loaded `agent.backends` map.

**Exports:** `BackendResolver`, `makeBackendResolver`

## packages/orchestrator/src/agent/backend-router.ts

[`packages/orchestrator/src/agent/backend-router.ts`](/packages/orchestrator/src/agent/backend-router.ts)

**Exports:** `BackendRouterOptions`, `toArray`, `BackendRouter`

## packages/orchestrator/src/agent/backends/serverless.ts

[`packages/orchestrator/src/agent/backends/serverless.ts`](/packages/orchestrator/src/agent/backends/serverless.ts)

**Exports:** `ServerlessHandle`, `ServerlessBackend`, `OciServerlessBackendConfig`, `OciServerlessBackend`

## packages/orchestrator/src/agent/backends/ssh.ts

[`packages/orchestrator/src/agent/backends/ssh.ts`](/packages/orchestrator/src/agent/backends/ssh.ts)

**Exports:** `SshBackendConfig`, `SshBackend`

## packages/orchestrator/src/agent/config-migration.ts

[`packages/orchestrator/src/agent/config-migration.ts`](/packages/orchestrator/src/agent/config-migration.ts)

**Exports:** `MigrationResult`, `migrateAgentConfig`

## packages/orchestrator/src/agent/intelligence-factory.ts

[`packages/orchestrator/src/agent/intelligence-factory.ts`](/packages/orchestrator/src/agent/intelligence-factory.ts)

**Exports:** `BuildPipelineDeps`, `BuildLayerDeps`, `IntelligenceFactoryDeps`, `IntelligencePipelineBundle`, `buildIntelligencePipeline`, `buildAnalysisProviderForLayer`

## packages/orchestrator/src/agent/local-model-resolver.ts

[`packages/orchestrator/src/agent/local-model-resolver.ts`](/packages/orchestrator/src/agent/local-model-resolver.ts)

**Exports:** `ResolverLogger`, `LocalModelResolverOptions`, `normalizeLocalModel`, `defaultFetchModels`, `LocalModelResolver`

## packages/orchestrator/src/agent/orchestrator-backend-factory.ts

[`packages/orchestrator/src/agent/orchestrator-backend-factory.ts`](/packages/orchestrator/src/agent/orchestrator-backend-factory.ts)

**Exports:** `OrchestratorBackendFactoryOptions`, `OrchestratorBackendFactory`

## packages/orchestrator/src/agent/triage-skill-mapping.ts

[`packages/orchestrator/src/agent/triage-skill-mapping.ts`](/packages/orchestrator/src/agent/triage-skill-mapping.ts)

Spec B Phase 3: map a {@link TriageSkill} (the coarse, hard-coded skill set the triage router produces) to a concrete catalog skill name + its declared cognitive_mode (if any), via the `harness-&lt;triageSkill&gt;` naming convention.

**Exports:** `ResolvedTriageSkill`, `resolveSkillForTriage`

## packages/orchestrator/src/agent/use-case-builder.ts

[`packages/orchestrator/src/agent/use-case-builder.ts`](/packages/orchestrator/src/agent/use-case-builder.ts)

**Exports:** `buildRoutingUseCase`

## packages/orchestrator/src/auth/audit.ts

[`packages/orchestrator/src/auth/audit.ts`](/packages/orchestrator/src/auth/audit.ts)

**Exports:** `AuditAppendInput`, `AuditLoggerOptions`, `AuditLogger`

## packages/orchestrator/src/auth/scopes.ts

[`packages/orchestrator/src/auth/scopes.ts`](/packages/orchestrator/src/auth/scopes.ts)

Pinned scope vocabulary.

**Exports:** `SCOPE_VOCABULARY`, `hasScope`, `requiredScopeForRoute`

## packages/orchestrator/src/auth/tokens.ts

[`packages/orchestrator/src/auth/tokens.ts`](/packages/orchestrator/src/auth/tokens.ts)

**Exports:** `CreateTokenInput`, `CreateTokenResult`, `TokenStore`

## packages/orchestrator/src/core/lane-persistence.ts

[`packages/orchestrator/src/core/lane-persistence.ts`](/packages/orchestrator/src/core/lane-persistence.ts)

Phase 4 (DLane-5): durable persistence of orchestrator task-lane state via the core event log.

**Exports:** `OrchestratorLaneSignal`, `mapOrchestratorLane`, `persistLane`, `PersistedLanes`, `readPersistedLanes`

## packages/orchestrator/src/core/stall-detector.ts

[`packages/orchestrator/src/core/stall-detector.ts`](/packages/orchestrator/src/core/stall-detector.ts)

Pure stall-detection: returns the issue IDs whose running entry has been silent for at least `stallTimeoutMs`.

**Exports:** `detectStalledIssues`

## packages/orchestrator/src/cost/cost-ceiling-monitor.ts

[`packages/orchestrator/src/cost/cost-ceiling-monitor.ts`](/packages/orchestrator/src/cost/cost-ceiling-monitor.ts)

Per-task cost ceiling specification, mirroring `TaskDefinition.costCeiling` (Hermes Phase 5).

**Exports:** `CostCeiling`, `CeilingAbortEvent`, `CeilingWarnEvent`, `PricingResolver`, `CostCeilingMonitorOptions`, `CostCeilingMonitor`, `computeUsageCostUsd`
