---
schemaVersion: 1
module: "packages/cli/src/mcp/tools"
sourceHash: "d71e99e2a738f223c6f1db62d3d333c683872952ac8d41203324dfcb86d75907"
compiledAt: "2026-08-29T15:27:04.026Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["acceptance-eval.ts", "adr-store.ts", "adr.ts", "advise-skills.test.ts", "advise-skills.ts", "agent-definitions.ts", "agent.ts", "align-design-system.ts", "api-craft.ts", "architecture.ts", "assess-project.ts", "audit-anatomy.ts", "audit-brand.ts", "blueprint.test.ts", "blueprint.ts", "canary.test.ts", "canary.ts", "ci.ts", "cli-ergonomics-craft.ts", "code-craft.ts", "code-nav.ts", "compact.ts", "compound.test.ts", "compound.ts", "conflict-prediction.ts", "constraint-emergence.ts", "copy-craft.ts", "cross-check.test.ts", "cross-check.ts", "decay-trends.ts", "design-craft.ts", "design-pipeline.ts", "detect-drift.ts", "dispatch-skills.ts", "docs-craft.ts", "docs-publish.ts", "docs.ts", "edit-file.test.ts", "edit-file.ts", "entropy.ts", "event-emitter.ts", "feedback.ts", "gateway-tools.test.ts", "gateway-tools.ts", "gather-context.ts", "generate-slash-commands.ts", "get-comprehension.test.ts", "get-comprehension.ts", "hermes-tools.test.ts", "init.ts", "insights-summary.ts", "instruction-density.test.ts", "instruction-density.ts", "interaction-renderer.test.ts", "interaction-renderer.ts", "interaction-schemas.ts", "interaction.ts", "knowledge-craft.ts", "linter.ts", "naming-craft.ts", "outcome-eval.ts", "parallelization.test.ts", "parallelization.ts", "performance.ts", "persona.ts", "phase-gate.ts", "predict-failures.ts", "pulse.test.ts", "pulse.ts", "recommend-skills.ts", "review-changes.ts", "review-pipeline.ts", "roadmap-auto-sync.ts", "roadmap-file-less.ts", "roadmap.ts", "search-sessions.ts", "search-skills.ts", "security-craft.ts", "security.ts", "skill-proposal.ts", "skill-telemetry.ts", "skill.ts", "spec-craft.ts", "stale-constraints.ts", "state.ts", "strategy.test.ts", "strategy.ts", "summarize-session.ts", "task-independence.ts", "test-craft.ts", "traceability.ts", "uat-signoff.test.ts", "uat-signoff.ts", "validate.ts", "webhook-tools.test.ts", "webhook-tools.ts"]
---

## Summary

`packages/cli/src/mcp/tools` is a 100+ tool registry that exposes harness operations to orchestrator agents via MCP. Tools are organized as name-matched pairs (definition + handler), assembled into a registry with middleware (injection guard → compaction → context budget), and tagged with authoritative capability declarations (scopes: read/write/exec; network flag). The module covers analysis, creation, mutation, subprocess execution, LLM-driven crafting, and evaluation domains.

## Invariants

- Handler registry keys must match tool definitions exactly by name for dispatch to work.
- Capability declarations are exhaustive and compiled into shipped artifacts; runtime reads declarations, never scans source.
- All tools marked trustedOutput: true skip output injection scanning; external tools must omit the flag to enable scanning.
- ToolDefinition lives in tool-types.ts to avoid circular dependency between tool files and server.ts.
- Middleware order (injection guard → compaction → context budget) is load-bearing because budget must measure post-compaction size.
- Resource URIs require matching handler entries; a missing handler throws at read time.
- Session update notification runs once via sessionChecked flag to prevent duplicate appends.
- Tool filter is applied to both definitions and handlers together; mismatches create dispatch errors.
- MCP context budget is resolved at startup and never re-read; runtime config changes are ignored.
- trustedOutput flag gates injection scanning for all handlers; flipping it affects security posture across all callers.

## Interface Contract

```ts
export AdrStoreError
export AlignDesignSystemOutput
export AlignInput
export ApiCraftInput
export ApiCraftOutput
export AuditBrandInput
export AuditBrandMode
export AuditBrandOutput
export CliErgonomicsCraftInput
export CliErgonomicsCraftOutput
export CodeCraftInput
export CodeCraftOutput
export CollectPromptsOutput
export CopyCraftInput
export CopyCraftOutput
export DECISIONS_DIR
export DesignPipelineContext
export DesignPipelineInput
export DetectDriftInput
export DetectDriftMode
export DetectDriftOutput
export DocsCraftInput
export DocsCraftOutput
export EmitInteractionInputSchema
export FinalizeApiCraftInput
export FinalizeCliErgonomicsCraftInput
export FinalizeCodeCraftInput
export FinalizeCopyCraftInput
export FinalizeDocsCraftInput
export FinalizeKnowledgeCraftInput
export FinalizeNamingCraftInput
export FinalizeSecurityCraftInput
export FinalizeSpecCraftInput
export FinalizeTestCraftInput
export FixOutcome
export InteractionBatchSchema
export InteractionConfirmationSchema
export InteractionOptionSchema
export InteractionQuestionWithOptionsSchema
export InteractionTransitionSchema
export InteractionTypeSchema
export KnowledgeCraftInput
export KnowledgeCraftOutput
export NamingCraftInput
export NamingCraftOutput
export RiskLevel
export SKILL_EVENTS_FILE
export SecurityCraftInput
export SecurityCraftOutput
export SpecCraftInput
export SpecCraftOutput
export TestCraftInput
export TestCraftOutput
export _resetCompoundLockHandlesForTests
export acceptanceEvalDefinition
export acquireCompoundLockDefinition
export addComponentDefinition
export adviseSkillsDefinition
export alignDesignSystemDefinition
export allocateNextNumber
export analyzeDiffDefinition
export apiCraftDefinition
export apiCraftFinalizeDefinition
export assessProjectDefinition
export auditAnatomyDefinition
export auditBrandDefinition
export autoSyncRoadmap
export canaryDiscoverTestCommandDefinition
export canaryProbeDefinition
export canaryRecommendFrameworkDefinition
export canaryRunHistoryDefinition
export checkDependenciesDefinition
export checkDocsDefinition
export checkPerformanceDefinition
export checkPhaseGateDefinition
export checkTaskIndependenceDefinition
export checkTraceabilityDefinition
export cliErgonomicsCraftDefinition
export cliErgonomicsCraftFinalizeDefinition
export codeCraftDefinition
export codeCraftFinalizeDefinition
export codeOutlineDefinition
export codeSearchDefinition
export codeUnfoldDefinition
export collectApiCraftPrompts
export collectCliErgonomicsCraftPrompts
export collectCodeCraftPrompts
export collectCopyCraftPrompts
export collectDocsCraftPrompts
export collectKnowledgeCraftPrompts
export collectNamingCraftPrompts
export collectSecurityCraftPrompts
export collectSpecCraftPrompts
export collectTestCraftPrompts
export compactToolDefinition
export copyCraftDefinition
export copyCraftFinalizeDefinition
export createAdr
export createSelfReviewDefinition
export createSkillDefinition
export decisionsDirFor
export designCraftToolDefinition
export designPipelineDefinition
export detectConstraintEmergenceDefinition
export detectDriftDefinition
export detectEntropyDefinition
export detectStaleConstraintsDefinition
export dispatchSkillsDefinition
export docsCraftDefinition
export docsCraftFinalizeDefinition
export docsPublishDefinition
export editFileDefinition
export emitInteractionDefinition
export emitSkillEvent
export emitSkillProposalDefinition
export finalizeApiCraft
export finalizeCliErgonomicsCraft
export finalizeCodeCraft
export finalizeCopyCraft
export finalizeDocsCraft
export finalizeKnowledgeCraft
export finalizeNamingCraft
export finalizeSecurityCraft
export finalizeSpecCraft
export finalizeTestCraft
export gatherContextDefinition
export generateAgentDefinitionsDefinition
export generateBlueprintDefinition
export generateLinterDefinition
export generatePersonaArtifactsDefinition
export generateSlashCommandsDefinition
export getComprehensionDefinition
export getCriticalPathsDefinition
export getDecayTrendsDefinition
export getPerfBaselinesDefinition
export getSecurityTrendsDefinition
export handleAcceptanceEval
export handleAcquireCompoundLock
export handleAddComponent
export handleAdviseSkills
export handleAlignDesignSystem
export handleAnalyzeDiff
export handleApiCraft
export handleApiCraftFinalize
export handleAssessProject
export handleAuditAnatomy
export handleAuditBrand
export handleCanaryDiscoverTestCommand
export handleCanaryProbe
export handleCanaryRecommendFramework
export handleCanaryRunHistory
export handleCheckDependencies
export handleCheckDocs
export handleCheckPerformance
export handleCheckPhaseGate
export handleCheckTaskIndependence
export handleCheckTraceability
export handleCliErgonomicsCraft
export handleCliErgonomicsCraftFinalize
export handleCodeCraft
export handleCodeCraftFinalize
export handleCodeOutline
export handleCodeSearch
export handleCodeUnfold
export handleCompact
export handleCopyCraft
export handleCopyCraftFinalize
export handleCreateSelfReview
export handleCreateSkill
export handleDesignCraft
export handleDesignPipeline
export handleDetectConstraintEmergence
export handleDetectDrift
export handleDetectEntropy
export handleDetectStaleConstraints
export handleDispatchSkills
export handleDocsCraft
export handleDocsCraftFinalize
export handleDocsPublish
export handleEditFile
export handleEmitInteraction
export handleEmitSkillProposal
export handleGatherContext
export handleGenerateAgentDefinitions
export handleGenerateBlueprint
export handleGenerateLinter
export handleGeneratePersonaArtifacts
export handleGenerateSlashCommands
export handleGetComprehension
export handleGetCriticalPaths
export handleGetDecayTrends
export handleGetPerfBaselines
export handleGetSecurityTrends
export handleInitProject
export handleInsightsSummary
export handleKnowledgeCraft
export handleKnowledgeCraftFinalize
export handleListGatewayTokens
export handleListPersonas
export handleListStreams
export handleManageAdr
export handleManageRoadmap
export handleManageRoadmapFileLess
export handleManageState
export handleNamingCraft
export handleNamingCraftFinalize
export handleOutcomeEval
export handlePlanParallelization
export handlePredictConflicts
export handlePredictFailures
export handleReadStrategy
export handleRecommendSkills
export handleReleaseCompoundLock
export handleRequestPeerReview
export handleReviewChanges
export handleRunAgentTask
export handleRunCIChecks
export handleRunCodeReview
export handleRunPersona
export handleRunSecurityScan
export handleRunSkill
export handleSearchSessions
export handleSearchSkills
export handleSecurityCraft
export handleSecurityCraftFinalize
export handleSeedPulseFromStrategy
export handleSpecCraft
export handleSpecCraftFinalize
export handleSubscribeWebhook
export handleSummarizeSession
export handleTestCraft
export handleTestCraftFinalize
export handleTriggerMaintenanceJob
export handleUatSignoff
export handleUpdatePerfBaselines
export handleValidateCrossCheck
export handleValidateLinterConfig
export handleValidateProject
export handleValidateStrategy
export handleWritePulseConfig
export handleWriteStrategy
export initProjectDefinition
export insightsSummaryDefinition
export knowledgeCraftDefinition
export knowledgeCraftFinalizeDefinition
export listAdrs
export listGatewayTokensDefinition
export listPersonasDefinition
export listStreamsDefinition
export manageAdrDefinition
export manageRoadmapDefinition
export manageStateDefinition
export namingCraftDefinition
export namingCraftFinalizeDefinition
export outcomeEvalDefinition
export padNumber
export parseAdr
export parseToolResponse
export planParallelizationDefinition
export predictConflictsDefinition
export predictFailuresDefinition
export readAdr
export readStrategyDefinition
export recommendSkillsDefinition
export releaseCompoundLockDefinition
export renderBatch
export renderConfirmation
export renderQuestion
export renderTransition
export requestPeerReviewDefinition
export resolveLintCommand
export resolveTestContent
export reviewChangesDefinition
export runAgentTaskDefinition
export runAlignDesignSystem
export runApiCraft
export runAudit
export runAuditBrand
export runCIChecksDefinition
export runCaptureCommand
export runCliErgonomicsCraft
export runCodeCraft
export runCodeReviewDefinition
export runCopyCraft
export runDesignCraft
export runDesignPipeline
export runDetectDrift
export runDocsCraft
export runInstructionDensityAudit
export runKnowledgeCraft
export runNamingCraft
export runPersonaDefinition
export runSecurityCraft
export runSecurityScanDefinition
export runSkillDefinition
export runSpecCraft
export runTestCraft
export searchSessionsDefinition
export searchSkillsDefinition
export securityCraftDefinition
export securityCraftFinalizeDefinition
export seedPulseFromStrategyDefinition
export serializeAdr
export serveOrRecompile
export slugify
export specCraftDefinition
export specCraftFinalizeDefinition
export subscribeWebhookDefinition
export summarizeSessionDefinition
export testCraftDefinition
export testCraftFinalizeDefinition
export triggerExternalSync
export triggerMaintenanceJobDefinition
export triggerScopedExternalSync
export uatSignoffDefinition
export updateAdr
export updatePerfBaselinesDefinition
export validateCrossCheckDefinition
export validateLinterConfigDefinition
export validateStrategyDefinition
export validateToolDefinition
export writePulseConfigDefinition
export writeStrategyDefinition
```

## Dependency Slice

```
import { AlignDesignSystemOutput, AlignInput, runAlignDesignSystem } from '../../align/index.js'
import { ApiCraftInput, ApiCraftMode, ApiCraftOutput, CollectPromptsOutput, FinalizeApiCraftInput, collectApiCraftPrompts, finalizeApiCraft, runApiCraft } from '../../api-craft/index.js'
import { PATTERN_CHECKS } from '../../audit/component-anatomy/catalog/patterns/index.js'
import { AnatomyFinding, Severity } from '../../audit/component-anatomy/findings/finding.js'
import { parseComponentDefinitionFromSource } from '../../audit/component-anatomy/parsers/ast.js'
import { resolveComponentType } from '../../audit/component-anatomy/resolvers/component-type.js'
import { resolveAnatomyRules } from '../../audit/component-anatomy/resolvers/source-of-truth.js'
import { runConventionRule } from '../../audit/component-anatomy/rules/convention-runner.js'
import { AuditBrandInput, AuditBrandOutput, runAuditBrand } from '../../brand/index.js'
import { CliErgonomicsCraftInput, CliErgonomicsCraftMode, CliErgonomicsCraftOutput, CollectPromptsOutput, FinalizeCliErgonomicsCraftInput, collectCliErgonomicsCraftPrompts, finalizeCliErgonomicsCraft, runCliErgonomicsCraft } from '../../cli-ergonomics-craft/index.js'
import { CodeCraftInput, CodeCraftMode, CodeCraftOutput, CollectPromptsOutput, FinalizeCodeCraftInput, collectCodeCraftPrompts, finalizeCodeCraft, runCodeCraft } from '../../code-craft/index.js'
import { runAdviseSkills } from '../../commands/advise-skills.js'
import from '../../commands/check-phase-gate.js'
import from '../../commands/create-skill.js'
import from '../../commands/generate-agent-definitions.js'
import { generateSlashCommands } from '../../commands/generate-slash-commands.js'
import from '../../commands/validate-cross-check.js'
import from '../../commands/validate.js'
import { runComprehend } from '../../comprehension/compile-run'
import { comprehensionEndpoint, readComprehensionConfig, selectSemanticModel } from '../../comprehension/config'
import { maybeCreateGenerateSemantic } from '../../comprehension/generate-semantic'
import { createStaticExtractor } from '../../comprehension/static-extractor'
import { loadAnalysisExclude } from '../../config/analysis-schema.js'
import { resolveConfig } from '../../config/loader'
import { findConfigFile, loadConfig, resolveConfig } from '../../config/loader.js'
import { CollectPromptsOutput, CopyCraftInput, CopyCraftMode, CopyCraftOutput, FinalizeCopyCraftInput, collectCopyCraftPrompts, finalizeCopyCraft, runCopyCraft } from '../../copy-craft/index.js'
import { SEED_EXEMPLARS } from '../../design-craft/catalog/exemplars/index.js'
import { SEED_PATTERNS } from '../../design-craft/catalog/patterns/index.js'
import { SEED_RUBRICS } from '../../design-craft/catalog/rubrics/index.js'
import { BenchmarkScore, CraftFinding, DesignCraftOutput } from '../../design-craft/findings/schema.js'
import { LlmProvider, getProvider } from '../../design-craft/llm/provider.js'
import { recordApply, recordCite, recordSignalEvent, recordTrigger } from '../../design-craft/measurement/index.js'
import { AwardBarConfig } from '../../design-craft/phases/award-bar.js'
import { BenchmarkTarget, VisionBenchmarkTarget, runBenchmark, runVisionBenchmark } from '../../design-craft/phases/benchmark.js'
import { CritiqueTarget, VisionCritiqueTarget, runCritique, runVisionCritique } from '../../design-craft/phases/critique.js'
import { PolishTarget, runPolish } from '../../design-craft/phases/polish.js'
import { DesignPipelineContext, DesignPipelineInput, runDesignPipeline } from '../../design-pipeline/index.js'
import { CollectPromptsOutput, DocsCraftInput, DocsCraftMode, DocsCraftOutput, FinalizeDocsCraftInput, collectDocsCraftPrompts, finalizeDocsCraft, runDocsCraft } from '../../docs-craft/index.js'
import { AttachMediaInput, DocsPublishConnector, DraftInput, PageTreeInput, PageTreeNode, VerifyRenderInput, resolveDocsPublishConnector } from '../../docs-publish/index.js'
import { DetectDriftInput, DetectDriftOutput, runDetectDrift } from '../../drift/index.js'
import { CollectPromptsOutput, FinalizeKnowledgeCraftInput, KnowledgeCraftInput, KnowledgeCraftMode, KnowledgeCraftOutput, collectKnowledgeCraftPrompts, finalizeKnowledgeCraft, runKnowledgeCraft } from '../../knowledge-craft/index.js'
import { CollectPromptsOutput, FinalizeNamingCraftInput, NamingCraftInput, NamingCraftMode, NamingCraftOutput, collectNamingCraftPrompts, finalizeNamingCraft, runNamingCraft } from '../../naming-craft/index.js'
import from '../../persona/constants.js'
import from '../../persona/generators/agents-md.js'
import from '../../persona/generators/ci-workflow.js'
import from '../../persona/generators/runtime.js'
import from '../../persona/loader.js'
import from '../../persona/runner.js'
import from '../../persona/skill-executor.js'
import { DEFAULT_RESPONSIVE_GATE_CONFIG, ResponsiveGateConfig, ResponsiveMetrics } from '../../responsive/index.js'
import { CollectPromptsOutput, FinalizeSecurityCraftInput, SecurityCraftInput, SecurityCraftMode, SecurityCraftOutput, collectSecurityCraftPrompts, finalizeSecurityCraft, runSecurityCraft } from '../../security-craft/index.js'
import { resolveCraftLlmMode } from '../../shared/craft/llm/provider.js'
import from '../../shared/state-events.js'
import { Verifier } from '../../shared/verifier.js'
import { dispatchSkills, dispatchSkillsFromGit, enrichSnapshotForDispatch } from '../../skill/dispatch-engine.js'
import { formatSuggestions, isTier1Skill, scoreSkill, suggest } from '../../skill/dispatcher.js'
import { HealthSnapshot, captureHealthSnapshot, isSnapshotFresh, loadCachedSnapshot } from '../../skill/health-snapshot.js'
import { loadOrRebuildIndex } from '../../skill/index-builder.js'
import { recommend } from '../../skill/recommendation-engine.js'
import { loadOrGenerateProfile } from '../../skill/stack-profile.js'
import { CollectPromptsOutput, FinalizeSpecCraftInput, SpecCraftInput, SpecCraftMode, SpecCraftOutput, collectSpecCraftPrompts, finalizeSpecCraft, runSpecCraft } from '../../spec-craft/index.js'
import from '../../templates/engine.js'
import { appendFrameworkAgents, ensureHarnessGitignore, persistToolingConfig } from '../../templates/post-write.js'
import { TemplateMetadata } from '../../templates/schema.js'
import { CollectPromptsOutput, FinalizeTestCraftInput, TestCraftInput, TestCraftOutput, collectTestCraftPrompts, finalizeTestCraft, runTestCraft } from '../../test-craft/index.js'
import { envEnabled } from '../../utils/env-flag.js'
import { findFiles } from '../../utils/files.js'
import { loadGuardianCoverage } from '../../utils/guardian-context.js'
import { resolvePersonasDir, resolveSkillsDir, resolveTemplatesDir } from '../../utils/paths.js'
import from '../resources/business-knowledge.js'
import { CORE_TOOL_NAMES, STANDARD_TOOL_NAMES } from '../tool-tiers'
import { ToolDefinition } from '../tool-types.js'
import { McpContentItem, McpResponse, mcpError } from '../utils.js'
import { resolveAnalysisProvider } from '../utils/analysis-provider'
import { resolveAnalysisProvider } from '../utils/analysis-provider.js'
import { resolveProjectConfig } from '../utils/config-resolver.js'
import from '../utils/glob-helper.js'
import { loadGraphStore } from '../utils/graph-loader.js'
import { McpToolResponse, bigIntSafeReplacer, resultToMcpResponse } from '../utils/result-adapter.js'
import { sanitizePath } from '../utils/sanitize-path.js'
import { sortFindingsBySeverity } from '../utils/severity.js'
import { AdrStoreError, CreateAdrInput, UpdateAdrInput, createAdr, listAdrs, readAdr, updateAdr } from './adr-store.js'
import { adviseSkillsDefinition, handleAdviseSkills } from './advise-skills.js'
import from './architecture.js'
import { generateBlueprintDefinition, handleGenerateBlueprint } from './blueprint.js'
import { handleCanaryDiscoverTestCommand, handleCanaryProbe, handleCanaryRecommendFramework, handleCanaryRunHistory } from './canary.js'
import { _resetCompoundLockHandlesForTests, acquireCompoundLockDefinition, handleAcquireCompoundLock, handleReleaseCompoundLock, releaseCompoundLockDefinition } from './compound'
import { handleValidateCrossCheck, validateCrossCheckDefinition } from './cross-check.js'
import from './docs.js'
import { editFileDefinition, handleEditFile } from './edit-file.js'
import from './entropy.js'
import { emitSkillEvent } from './event-emitter.js'
import from './feedback.js'
import { handleListGatewayTokens, handleTriggerMaintenanceJob, listGatewayTokensDefinition, triggerMaintenanceJobDefinition } from './gateway-tools'
import { ServeOrRecompileDeps, getComprehensionDefinition, handleGetComprehension, serveOrRecompile } from './get-comprehension'
import { handleInsightsSummary, insightsSummaryDefinition } from './insights-summary'
import { runInstructionDensityAudit } from './instruction-density'
import { renderBatch, renderConfirmation, renderQuestion, renderTransition } from './interaction-renderer'
import { renderBatch, renderConfirmation, renderQuestion, renderTransition } from './interaction-renderer.js'
import { InteractionBatch, InteractionConfirmation, InteractionOption, InteractionQuestion, InteractionTransition } from './interaction-schemas'
import { EmitInteractionInputSchema, InteractionBatch, InteractionBatchSchema, InteractionConfirmation, InteractionConfirmationSchema, InteractionOption, InteractionQuestion, InteractionQuestionWithOptionsSchema, InteractionTransition, InteractionTransitionSchema } from './interaction-schemas.js'
import { handlePlanParallelization, planParallelizationDefinition } from './parallelization'
import from './performance.js'
import { handleSeedPulseFromStrategy, handleWritePulseConfig, seedPulseFromStrategyDefinition, writePulseConfigDefinition } from './pulse'
import from './review-pipeline.js'
import { RowLinkOutcome, autoSyncRoadmap, triggerExternalSync, triggerScopedExternalSync } from './roadmap-auto-sync.js'
import { handleManageRoadmapFileLess } from './roadmap-file-less.js'
import { handleSearchSessions, searchSessionsDefinition } from './search-sessions'
import from './security.js'
import { handleReadStrategy, handleValidateStrategy, handleWriteStrategy, readStrategyDefinition, validateStrategyDefinition, writeStrategyDefinition } from './strategy'
import { handleSummarizeSession, summarizeSessionDefinition } from './summarize-session'
import { handleUatSignoff, uatSignoffDefinition } from './uat-signoff.js'
import from './validate.js'
import { handleSubscribeWebhook, subscribeWebhookDefinition } from './webhook-tools'
import { CHARS_PER_TOKEN, COMPREHENSION_ROOT, CompactionPipeline, ComprehensionSourceFile, ComprehensionStore, ComprehensionUnit, ConflictError, DEFAULT_INSTRUCTION_BUDGET, DriftConfig, Err, ExtractStatic, FeaturePatch, GenerateSemantic, LevelInstructionDensity, NewFeatureInput, Ok, PackedEnvelope, Result, RoadmapPromoteCoreResult, RoadmapTrackerClient, SourceFile, StaticExtraction, StructuralStrategy, TrackedFeature, TrackerSyncAdapter, TruncationStrategy, analyzeSkillInstructionDensity, applyRoadmapDiff, archiveDoneShardsForProject, computeLoadPlan, computeSourceHash, createNodeComprehensionIO, createNodeModuleSourceReader, createTrackerClient, decidePromotionForRow, detectRoadmapStorageMode, estimateTokens, extractLevel, loadProjectRoadmapMode, loadTrackerClientConfigFromProject, loadTrackerSyncConfig, paginate, renderServedUnit, resolveRoadmapStore, roadmapSourceExists, serializeEnvelope, serveGate, slugifyFeatureName } from '@harness-engineering/core'
import { skipDirGlobs } from '@harness-engineering/graph'
import { AnalysisProvider, CanaryAdapter, CanaryFrameworkInfo, GuardianAnalysis, createCanaryAdapter, readGuardianAnalyses, resolveTestCommand } from '@harness-engineering/intelligence'
import from '@harness-engineering/linter-gen'
import from '@harness-engineering/orchestrator'
import { INDEXED_FILE_KINDS, INSIGHTS_KEYS, IndexedFileKind, InsightsKey, Ok, Result, Roadmap, SessionsConfig, TrackerSyncConfig } from '@harness-engineering/types'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import from 'dotenv'
import * as fs from 'fs'
import from 'fs/promises'
import from 'glob'
import { execSync } from 'node:child_process'
import * as crypto, { randomUUID } from 'node:crypto'
import * as fs, { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import * as fs, { mkdir, readFile } from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as nodePath, * as path, path, { join } from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseYaml } from 'yaml'
import { z } from 'zod'
```
