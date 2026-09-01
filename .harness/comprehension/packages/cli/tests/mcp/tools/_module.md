---
schemaVersion: 1
module: 'packages/cli/tests/mcp/tools'
sourceHash: '9ed5d987a20eef9c3d19ac6bd5c16ec57740510b76a57cf13d11840fc34d3a00'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'acceptance-eval.test.ts',
    'adr-worktree.test.ts',
    'adr.test.ts',
    'agent.test.ts',
    'api-craft.test.ts',
    'architecture.test.ts',
    'assess-project-error-handling.test.ts',
    'assess-project.test.ts',
    'brainstorming-file-less-smoke.test.ts',
    'cli-ergonomics-craft.test.ts',
    'code-craft.test.ts',
    'code-nav-handlers.test.ts',
    'code-nav.test.ts',
    'compact.test.ts',
    'conflict-prediction.test.ts',
    'constraint-emergence.test.ts',
    'copy-craft.test.ts',
    'cross-check.test.ts',
    'decay-trends.test.ts',
    'docs-craft.test.ts',
    'docs.test.ts',
    'entropy-config-threading.test.ts',
    'entropy.test.ts',
    'event-emitter.test.ts',
    'events-jsonl-retired.guard.test.ts',
    'feedback.test.ts',
    'gather-context-comprehension.test.ts',
    'gather-context-extra.test.ts',
    'gather-context-session.test.ts',
    'gather-context.test.ts',
    'generate-slash-commands.test.ts',
    'graph-anomaly.test.ts',
    'graph-ask.test.ts',
    'graph-blast-radius.test.ts',
    'graph.test.ts',
    'init.test.ts',
    'interaction.test.ts',
    'knowledge-craft.test.ts',
    'linter.test.ts',
    'naming-craft.test.ts',
    'outcome-eval.test.ts',
    'pagination-integration.test.ts',
    'performance.test.ts',
    'persona-handlers.test.ts',
    'persona.security.test.ts',
    'persona.test.ts',
    'phase-gate.test.ts',
    'predict-failures.test.ts',
    'put-comprehension.test.ts',
    'recommend-skills.test.ts',
    'refinement-telemetry.test.ts',
    'review-changes.test.ts',
    'review-pipeline.test.ts',
    'roadmap-auto-sync.test.ts',
    'roadmap-groom-sharded.test.ts',
    'roadmap-groom.test.ts',
    'roadmap-missing-path.test.ts',
    'roadmap-scoped-sync.test.ts',
    'roadmap.file-backed-regression.test.ts',
    'roadmap.file-less-stub.test.ts',
    'roadmap.file-less.test.ts',
    'roadmap.sharded.test.ts',
    'roadmap.test.ts',
    'search-skills.test.ts',
    'security-craft.test.ts',
    'skill-progressive-loading.test.ts',
    'skill-proposal.test.ts',
    'skill-telemetry.test.ts',
    'skill.security.test.ts',
    'skill.test.ts',
    'spec-craft.test.ts',
    'stale-constraints.test.ts',
    'state-events.test.ts',
    'state-extra.test.ts',
    'state-sc1-guard.test.ts',
    'state.test.ts',
    'task-independence.test.ts',
    'test-craft.test.ts',
    'traceability.test.ts',
    'validate.test.ts',
    'workflow-e2e.test.ts',
  ]
---

## Interface Contract

```ts
export changedShards
export snapshotShardDir
export writeShardedProject
```

## Dependency Slice

```
import { computeLoadPlan } from '../../../../core/src/context/progressive-loader'
import { extractLevel } from '../../../../core/src/context/section-parser'
import { acceptanceEvalDefinition, handleAcceptanceEval, resolveTestContent } from '../../../src/mcp/tools/acceptance-eval.js'
import { handleManageAdr, manageAdrDefinition } from '../../../src/mcp/tools/adr'
import { allocateNextNumber, listAdrs, resolveWorktreeRoot } from '../../../src/mcp/tools/adr-store'
import { addComponentDefinition, handleAddComponent, handleRunAgentTask, runAgentTaskDefinition } from '../../../src/mcp/tools/agent'
import { apiCraftDefinition, apiCraftFinalizeDefinition, handleApiCraft, handleApiCraftFinalize } from '../../../src/mcp/tools/api-craft'
import { checkDependenciesDefinition } from '../../../src/mcp/tools/architecture'
import { assessProjectDefinition, handleAssessProject, parseToolResponse, resolveLintCommand } from '../../../src/mcp/tools/assess-project'
import { cliErgonomicsCraftDefinition, cliErgonomicsCraftFinalizeDefinition, handleCliErgonomicsCraft, handleCliErgonomicsCraftFinalize } from '../../../src/mcp/tools/cli-ergonomics-craft'
import { codeCraftDefinition, codeCraftFinalizeDefinition, handleCodeCraft, handleCodeCraftFinalize } from '../../../src/mcp/tools/code-craft'
import { codeOutlineDefinition, codeSearchDefinition, codeUnfoldDefinition, handleCodeOutline, handleCodeSearch, handleCodeUnfold } from '../../../src/mcp/tools/code-nav'
import { codeOutlineDefinition } from '../../../src/mcp/tools/code-nav.js'
import { compactToolDefinition, handleCompact } from '../../../src/mcp/tools/compact'
import { handlePredictConflicts, predictConflictsDefinition } from '../../../src/mcp/tools/conflict-prediction.js'
import { detectConstraintEmergenceDefinition, handleDetectConstraintEmergence } from '../../../src/mcp/tools/constraint-emergence'
import { copyCraftDefinition, copyCraftFinalizeDefinition, handleCopyCraft, handleCopyCraftFinalize } from '../../../src/mcp/tools/copy-craft'
import { validateCrossCheckDefinition } from '../../../src/mcp/tools/cross-check'
import { getDecayTrendsDefinition, handleGetDecayTrends } from '../../../src/mcp/tools/decay-trends'
import { getDecayTrendsDefinition } from '../../../src/mcp/tools/decay-trends.js'
import { checkDocsDefinition, handleCheckDocs } from '../../../src/mcp/tools/docs'
import { docsCraftDefinition, docsCraftFinalizeDefinition, handleDocsCraft, handleDocsCraftFinalize } from '../../../src/mcp/tools/docs-craft'
import { detectEntropyDefinition, handleDetectEntropy } from '../../../src/mcp/tools/entropy'
import { emitSkillEvent } from '../../../src/mcp/tools/event-emitter'
import { analyzeDiffDefinition, createSelfReviewDefinition, handleAnalyzeDiff, handleCreateSelfReview, handleRequestPeerReview, requestPeerReviewDefinition } from '../../../src/mcp/tools/feedback'
import { gatherContextDefinition, handleGatherContext } from '../../../src/mcp/tools/gather-context'
import { gatherContextDefinition } from '../../../src/mcp/tools/gather-context.js'
import { generateSlashCommandsDefinition, handleGenerateSlashCommands } from '../../../src/mcp/tools/generate-slash-commands'
import { askGraphDefinition, computeBlastRadiusDefinition, detectAnomaliesDefinition, getImpactDefinition, getRelationshipsDefinition, handleAskGraph, handleComputeBlastRadius, handleDetectAnomalies, handleFindContextFor, handleGetImpact, handleGetRelationships, handleIngestSource, handleQueryGraph, handleSearchSimilar, queryGraphDefinition, searchSimilarDefinition } from '../../../src/mcp/tools/graph/index.js'
import { handleInitProject, initProjectDefinition } from '../../../src/mcp/tools/init'
import { emitInteractionDefinition, handleEmitInteraction } from '../../../src/mcp/tools/interaction'
import { EmitInteractionInputSchema, InteractionBatchSchema, InteractionConfirmationSchema, InteractionOptionSchema, InteractionQuestionWithOptionsSchema, InteractionTransitionSchema } from '../../../src/mcp/tools/interaction-schemas'
import { handleKnowledgeCraft, handleKnowledgeCraftFinalize, knowledgeCraftDefinition, knowledgeCraftFinalizeDefinition } from '../../../src/mcp/tools/knowledge-craft'
import { generateLinterDefinition, handleGenerateLinter, handleValidateLinterConfig, validateLinterConfigDefinition } from '../../../src/mcp/tools/linter'
import { handleNamingCraft, handleNamingCraftFinalize, namingCraftDefinition, namingCraftFinalizeDefinition } from '../../../src/mcp/tools/naming-craft'
import { handleOutcomeEval, outcomeEvalDefinition } from '../../../src/mcp/tools/outcome-eval.js'
import { checkPerformanceDefinition, getCriticalPathsDefinition, getPerfBaselinesDefinition, handleCheckPerformance, handleGetCriticalPaths, handleGetPerfBaselines, handleUpdatePerfBaselines, updatePerfBaselinesDefinition } from '../../../src/mcp/tools/performance'
import { generatePersonaArtifactsDefinition, handleGeneratePersonaArtifacts, handleListPersonas, handleRunPersona, listPersonasDefinition, runPersonaDefinition } from '../../../src/mcp/tools/persona'
import { checkPhaseGateDefinition } from '../../../src/mcp/tools/phase-gate'
import { handlePredictFailures, predictFailuresDefinition } from '../../../src/mcp/tools/predict-failures.js'
import { AttachSemanticDeps, attachSemantic, handlePutComprehension } from '../../../src/mcp/tools/put-comprehension'
import { handleRecommendSkills, recommendSkillsDefinition } from '../../../src/mcp/tools/recommend-skills.js'
import { REFINEMENT_EVENTS_FILE, readRefinementDemand, recordRefinement } from '../../../src/mcp/tools/refinement-telemetry'
import { handleReviewChanges, reviewChangesDefinition } from '../../../src/mcp/tools/review-changes'
import { reviewChangesDefinition } from '../../../src/mcp/tools/review-changes.js'
import { handleRunCodeReview, runCodeReviewDefinition } from '../../../src/mcp/tools/review-pipeline'
import { runCodeReviewDefinition } from '../../../src/mcp/tools/review-pipeline.js'
import { handleManageRoadmap, manageRoadmapDefinition } from '../../../src/mcp/tools/roadmap'
import * as autoSync, { autoSyncRoadmap, triggerScopedExternalSync } from '../../../src/mcp/tools/roadmap-auto-sync'
import { handleManageRoadmapFileLess } from '../../../src/mcp/tools/roadmap-file-less'
import { handleSearchSkills, searchSkillsDefinition } from '../../../src/mcp/tools/search-skills.js'
import { handleSecurityCraft, handleSecurityCraftFinalize, securityCraftDefinition, securityCraftFinalizeDefinition } from '../../../src/mcp/tools/security-craft'
import { createSkillDefinition, handleCreateSkill, handleRunSkill, runSkillDefinition } from '../../../src/mcp/tools/skill'
import { emitSkillProposalDefinition, handleEmitSkillProposal } from '../../../src/mcp/tools/skill-proposal'
import { SKILL_EVENTS_FILE, emitSkillEvent } from '../../../src/mcp/tools/skill-telemetry'
import { handleSpecCraft, handleSpecCraftFinalize, specCraftDefinition, specCraftFinalizeDefinition } from '../../../src/mcp/tools/spec-craft'
import { detectStaleConstraintsDefinition, handleDetectStaleConstraints } from '../../../src/mcp/tools/stale-constraints'
import { handleListStreams, handleManageState, listStreamsDefinition, manageStateDefinition } from '../../../src/mcp/tools/state'
import { checkTaskIndependenceDefinition, handleCheckTaskIndependence } from '../../../src/mcp/tools/task-independence.js'
import { handleTestCraft, handleTestCraftFinalize, testCraftDefinition, testCraftFinalizeDefinition } from '../../../src/mcp/tools/test-craft'
import { checkTraceabilityDefinition, handleCheckTraceability } from '../../../src/mcp/tools/traceability'
import { handleValidateProject, validateToolDefinition } from '../../../src/mcp/tools/validate'
import { loadGraphStore } from '../../../src/mcp/utils/graph-loader.js'
import from '../../../src/mcp/utils/sanitize-path.js'
import { generateAgentsMd } from '../../../src/persona/generators/agents-md'
import { generateCIWorkflow } from '../../../src/persona/generators/ci-workflow'
import { generateRuntime } from '../../../src/persona/generators/runtime'
import { listPersonas, loadPersona } from '../../../src/persona/loader'
import { runPersona } from '../../../src/persona/runner'
import from '../../../src/shared/state-events'
import { scoreSkill, suggest } from '../../../src/skill/dispatcher'
import { formatSuggestions, isTier1Skill, suggest } from '../../../src/skill/dispatcher.js'
import { HealthSnapshot, captureHealthSnapshot, isSnapshotFresh, loadCachedSnapshot } from '../../../src/skill/health-snapshot'
import { loadOrRebuildIndex } from '../../../src/skill/index-builder'
import { recommend } from '../../../src/skill/recommendation-engine'
import { loadOrGenerateProfile } from '../../../src/skill/stack-profile'
import { COMPILER_VERSION, ComprehensionSourceFile, ComprehensionStore, ComprehensionUnit, ConflictError, Err, ExtractStatic, FeaturePatch, HistoryEvent, NewFeatureInput, Ok, Result, RoadmapTrackerClient, SCHEMA_VERSION, TrackedFeature, compileModule, computeSourceHash, createNodeComprehensionIO, createNodeModuleSourceReader, detectStaleConstraints, loadTrackerConfig, parseRoadmap, roadmapToShards, serializeMeta, serializeShard } from '@harness-engineering/core'
import { queryTraceability } from '@harness-engineering/graph'
import { deriveAcceptanceAuthority } from '@harness-engineering/intelligence'
import { Err, Ok, Result } from '@harness-engineering/types'
import * as fs from 'fs'
import * as fs from 'fs/promises'
import { execFileSync } from 'node:child_process'
import * as fs, { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as os, { tmpdir } from 'os'
import * as path, { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
