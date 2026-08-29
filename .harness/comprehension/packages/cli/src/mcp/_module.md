---
schemaVersion: 1
module: "packages/cli/src/mcp"
sourceHash: "d6216fc4ab82f5b1acb0f58158219d1cba7a5351cffde7b0e77d9139e9675ddd"
compiledAt: "2026-08-29T14:14:27.819Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["context-surface.ts", "index.ts", "server.ts", "tool-capabilities.ts", "tool-capability-declarations.ts", "tool-tiers.ts", "tool-types.ts", "utils.ts"]
---

## Summary

The MCP module (`packages/cli/src/mcp`) is the harness's Model Context Protocol server and tool registry. It exposes the harness's full capability surface to Claude and other agents via MCP: ~150+ tools organized into functional domains (design, testing, security, architecture, docs, etc.), plus read-only resources (project config, skill catalog, roadmap, graph entities). The server handles tool dispatch, applies middleware (injection guards, context budgeting, compaction), and measures the harness's always-loaded context surface (tool schemas by tier, AGENTS.md, hooks). Tools are registered via a central `getToolDefinitions()` registry; each tool pairs a schema definition with a handler. Resources are best-effort file-based views of project state that degrade gracefully on read failures.

## Invariants

- Tool tier membership is fixed and context-sized: tools are partitioned into `core`, `standard`, and `full` tiers; tier-aware context-surface measurement is the authoritative cost model for schema bytes. Tool names must appear in exactly one of `CORE_TOOL_NAMES`, `STANDARD_TOOL_NAMES` or neither.
- Tool definition ↔ handler pairs must stay in sync: each tool in `getToolDefinitions()` must have a matching handler (registered in `CallToolRequest` dispatch) with compatible input schema; missing or mismatched handlers cause silent failures at runtime.
- MCP resources degrade gracefully: file reads for AGENTS.md, hooks, skill trees use try-catch and return null on failure; resource gathering is best-effort and never blocks server startup.
- Middleware ordering is load-bearing: injection-guard runs first (rejects unsafe patterns), then compaction (shrinks responses), then context-budget (enforces token limits); reordering changes security or budget semantics.
- Project config resolution is mandatory before tool dispatch: `resolveProjectConfig` must succeed for tools to access harness state (roadmap, ADRs, rules); tools without config context fail gracefully.

## Interface Contract

```ts
export createHarnessServer
export getToolDefinitions
export resolveProjectConfig
export resultToMcpResponse
export startServer
```

## Dependency Slice

```
import { ensureHarnessGitignore } from '../templates/post-write.js'
import from '../version.js'
import { getToolDefinitions } from './index.js'
import { applyCompaction } from './middleware/compaction.js'
import { applyContextBudget } from './middleware/context-budget.js'
import { applyInjectionGuard } from './middleware/injection-guard.js'
import { getBusinessKnowledgeResource } from './resources/business-knowledge.js'
import { getEntitiesResource, getGraphResource, getRelationshipsResource } from './resources/graph.js'
import { getLearningsResource } from './resources/learnings.js'
import { getProjectResource } from './resources/project.js'
import { getRulesResource } from './resources/rules.js'
import { getSkillsResource } from './resources/skills.js'
import { getStateResource } from './resources/state.js'
import { TOOL_CAPABILITY_DECLARATIONS } from './tool-capability-declarations.js'
import { CORE_TOOL_NAMES, McpToolTier, STANDARD_TOOL_NAMES } from './tool-tiers.js'
import { ToolCapabilityDeclaration, ToolDefinition, ToolScope } from './tool-types.js'
import { acceptanceEvalDefinition, handleAcceptanceEval } from './tools/acceptance-eval.js'
import { handleManageAdr, manageAdrDefinition } from './tools/adr.js'
import { adviseSkillsDefinition, handleAdviseSkills } from './tools/advise-skills.js'
import { generateAgentDefinitionsDefinition, handleGenerateAgentDefinitions } from './tools/agent-definitions.js'
import { addComponentDefinition, handleAddComponent, handleRunAgentTask, runAgentTaskDefinition } from './tools/agent.js'
import { alignDesignSystemDefinition, handleAlignDesignSystem } from './tools/align-design-system.js'
import { apiCraftDefinition, apiCraftFinalizeDefinition, handleApiCraft, handleApiCraftFinalize } from './tools/api-craft.js'
import { checkDependenciesDefinition, handleCheckDependencies } from './tools/architecture.js'
import { assessProjectDefinition, handleAssessProject } from './tools/assess-project.js'
import { auditAnatomyDefinition, handleAuditAnatomy } from './tools/audit-anatomy.js'
import { auditBrandDefinition, handleAuditBrand } from './tools/audit-brand.js'
import { generateBlueprintDefinition, handleGenerateBlueprint } from './tools/blueprint.js'
import { canaryDiscoverTestCommandDefinition, canaryProbeDefinition, canaryRecommendFrameworkDefinition, canaryRunHistoryDefinition, handleCanaryDiscoverTestCommand, handleCanaryProbe, handleCanaryRecommendFramework, handleCanaryRunHistory } from './tools/canary.js'
import { handleRunCIChecks, runCIChecksDefinition } from './tools/ci.js'
import { cliErgonomicsCraftDefinition, cliErgonomicsCraftFinalizeDefinition, handleCliErgonomicsCraft, handleCliErgonomicsCraftFinalize } from './tools/cli-ergonomics-craft.js'
import { codeCraftDefinition, codeCraftFinalizeDefinition, handleCodeCraft, handleCodeCraftFinalize } from './tools/code-craft.js'
import { codeOutlineDefinition, codeSearchDefinition, codeUnfoldDefinition, handleCodeOutline, handleCodeSearch, handleCodeUnfold } from './tools/code-nav.js'
import { compactToolDefinition, handleCompact } from './tools/compact.js'
import { acquireCompoundLockDefinition, handleAcquireCompoundLock, handleReleaseCompoundLock, releaseCompoundLockDefinition } from './tools/compound.js'
import { handlePredictConflicts, predictConflictsDefinition } from './tools/conflict-prediction.js'
import { detectConstraintEmergenceDefinition, handleDetectConstraintEmergence } from './tools/constraint-emergence.js'
import { copyCraftDefinition, copyCraftFinalizeDefinition, handleCopyCraft, handleCopyCraftFinalize } from './tools/copy-craft.js'
import { handleValidateCrossCheck, validateCrossCheckDefinition } from './tools/cross-check.js'
import { getDecayTrendsDefinition, handleGetDecayTrends } from './tools/decay-trends.js'
import { designCraftToolDefinition, handleDesignCraft } from './tools/design-craft.js'
import { designPipelineDefinition, handleDesignPipeline } from './tools/design-pipeline.js'
import { detectDriftDefinition, handleDetectDrift } from './tools/detect-drift.js'
import { dispatchSkillsDefinition, handleDispatchSkills } from './tools/dispatch-skills.js'
import { docsCraftDefinition, docsCraftFinalizeDefinition, handleDocsCraft, handleDocsCraftFinalize } from './tools/docs-craft.js'
import { docsPublishDefinition, handleDocsPublish } from './tools/docs-publish.js'
import { checkDocsDefinition, handleCheckDocs } from './tools/docs.js'
import { editFileDefinition, handleEditFile } from './tools/edit-file.js'
import { detectEntropyDefinition, handleDetectEntropy } from './tools/entropy.js'
import { analyzeDiffDefinition, createSelfReviewDefinition, handleAnalyzeDiff, handleCreateSelfReview, handleRequestPeerReview, requestPeerReviewDefinition } from './tools/feedback.js'
import { handleListGatewayTokens, handleTriggerMaintenanceJob, listGatewayTokensDefinition, triggerMaintenanceJobDefinition } from './tools/gateway-tools.js'
import { gatherContextDefinition, handleGatherContext } from './tools/gather-context.js'
import { generateSlashCommandsDefinition, handleGenerateSlashCommands } from './tools/generate-slash-commands.js'
import { getComprehensionDefinition, handleGetComprehension } from './tools/get-comprehension.js'
import { askGraphDefinition, computeBlastRadiusDefinition, detectAnomaliesDefinition, findContextForDefinition, getGraphSchemaDefinition, getImpactDefinition, getRelationshipsDefinition, handleAskGraph, handleComputeBlastRadius, handleDetectAnomalies, handleFindContextFor, handleGetGraphSchema, handleGetImpact, handleGetRelationships, handleIngestSource, handleQueryGraph, handleSearchSimilar, ingestSourceDefinition, queryGraphDefinition, searchSimilarDefinition } from './tools/graph/index.js'
import { handleInitProject, initProjectDefinition } from './tools/init.js'
import { handleInsightsSummary, insightsSummaryDefinition } from './tools/insights-summary.js'
import { emitInteractionDefinition, handleEmitInteraction } from './tools/interaction.js'
import { handleKnowledgeCraft, handleKnowledgeCraftFinalize, knowledgeCraftDefinition, knowledgeCraftFinalizeDefinition } from './tools/knowledge-craft.js'
import { generateLinterDefinition, handleGenerateLinter, handleValidateLinterConfig, validateLinterConfigDefinition } from './tools/linter.js'
import { handleNamingCraft, handleNamingCraftFinalize, namingCraftDefinition, namingCraftFinalizeDefinition } from './tools/naming-craft.js'
import { handleOutcomeEval, outcomeEvalDefinition } from './tools/outcome-eval.js'
import { handlePlanParallelization, planParallelizationDefinition } from './tools/parallelization.js'
import { checkPerformanceDefinition, getCriticalPathsDefinition, getPerfBaselinesDefinition, handleCheckPerformance, handleGetCriticalPaths, handleGetPerfBaselines, handleUpdatePerfBaselines, updatePerfBaselinesDefinition } from './tools/performance.js'
import { generatePersonaArtifactsDefinition, handleGeneratePersonaArtifacts, handleListPersonas, handleRunPersona, listPersonasDefinition, runPersonaDefinition } from './tools/persona.js'
import { checkPhaseGateDefinition, handleCheckPhaseGate } from './tools/phase-gate.js'
import { handlePredictFailures, predictFailuresDefinition } from './tools/predict-failures.js'
import { handleSeedPulseFromStrategy, handleWritePulseConfig, seedPulseFromStrategyDefinition, writePulseConfigDefinition } from './tools/pulse.js'
import { handlePutComprehension, putComprehensionDefinition } from './tools/put-comprehension.js'
import { handleRecommendSkills, recommendSkillsDefinition } from './tools/recommend-skills.js'
import { handleReviewChanges, reviewChangesDefinition } from './tools/review-changes.js'
import { handleRunCodeReview, runCodeReviewDefinition } from './tools/review-pipeline.js'
import { handleManageRoadmap, manageRoadmapDefinition } from './tools/roadmap.js'
import { handleSearchSessions, searchSessionsDefinition } from './tools/search-sessions.js'
import { handleSearchSkills, searchSkillsDefinition } from './tools/search-skills.js'
import { handleSecurityCraft, handleSecurityCraftFinalize, securityCraftDefinition, securityCraftFinalizeDefinition } from './tools/security-craft.js'
import { getSecurityTrendsDefinition, handleGetSecurityTrends, handleRunSecurityScan, runSecurityScanDefinition } from './tools/security.js'
import { emitSkillProposalDefinition, handleEmitSkillProposal } from './tools/skill-proposal.js'
import { createSkillDefinition, handleCreateSkill, handleRunSkill, runSkillDefinition } from './tools/skill.js'
import { handleSpecCraft, handleSpecCraftFinalize, specCraftDefinition, specCraftFinalizeDefinition } from './tools/spec-craft.js'
import { detectStaleConstraintsDefinition, handleDetectStaleConstraints } from './tools/stale-constraints.js'
import { handleListStreams, handleManageState, listStreamsDefinition, manageStateDefinition } from './tools/state.js'
import { handleReadStrategy, handleValidateStrategy, handleWriteStrategy, readStrategyDefinition, validateStrategyDefinition, writeStrategyDefinition } from './tools/strategy.js'
import { handleSummarizeSession, summarizeSessionDefinition } from './tools/summarize-session.js'
import { checkTaskIndependenceDefinition, handleCheckTaskIndependence } from './tools/task-independence.js'
import { handleTestCraft, handleTestCraftFinalize, testCraftDefinition, testCraftFinalizeDefinition } from './tools/test-craft.js'
import { checkTraceabilityDefinition, handleCheckTraceability } from './tools/traceability.js'
import { handleUatSignoff, uatSignoffDefinition } from './tools/uat-signoff.js'
import { handleValidateProject, validateToolDefinition } from './tools/validate.js'
import { handleSubscribeWebhook, subscribeWebhookDefinition } from './tools/webhook-tools.js'
import { resolveProjectConfig } from './utils/config-resolver.js'
import { ContextSurfaceEntry } from '@harness-engineering/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
```
