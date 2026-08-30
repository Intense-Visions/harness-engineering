---
schemaVersion: 1
module: 'packages/orchestrator/src/workflow'
sourceHash: '21f855d976136fc1feda4ca8571cf2bdb4636d037422ec248de281134e478ed8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'comprehension-blast-radius.test.ts',
    'comprehension-blast-radius.ts',
    'comprehension-prewarm.test.ts',
    'comprehension-prewarm.ts',
    'config.staged-routing.test.ts',
    'config.ts',
    'doc-coverage-gate.test.ts',
    'doc-coverage-gate.ts',
    'execute-workflow.4b.test.ts',
    'execute-workflow.staged-integration.test.ts',
    'execute-workflow.test.ts',
    'execute-workflow.ts',
    'gate-feedback.test.ts',
    'gate-feedback.ts',
    'loader.ts',
    'local-stage-prompt.test.ts',
    'local-stage-prompt.ts',
    'orchestrator-context.blast-radius-seam.test.ts',
    'orchestrator-context.prewarm-seam.test.ts',
    'orchestrator-context.ts',
    'peer-unload.test.ts',
    'peer-unload.ts',
    'persist-stage-document.test.ts',
    'schema.acceptance.test.ts',
    'schema.amr-config.test.ts',
    'schema.expects.test.ts',
    'schema.roadmap-triage.test.ts',
    'schema.ts',
    'skill-catalog.ts',
    'stage-backend-routing.test.ts',
    'stage-prompt-template.ts',
    'unstick-advisory.test.ts',
    'unstick-advisory.ts',
    'workflow-for.ts',
  ]
---

## Interface Contract

```ts
export AgentBudgetSchema
export BackendCapabilitiesSchema
export BackendDefSchema
export DEFAULT_BLAST_RADIUS_TOKEN_BUDGET
export DEFAULT_REASONER_ASSIST_AFTER
export DEFAULT_STAGE_DEADLINE_MS
export LOCAL_DOCUMENT_STAGE_DEADLINE_MS
export LOCAL_STAGE_DEADLINE_MS
export LOCAL_STAGE_PROMPT_TEMPLATE
export REASONER_UNSTICK_TIMEOUT_MS
export RoadmapAutoTriageSchema
export RoadmapConfigSchema
export RoutingConfigSchema
export RoutingPolicySchema
export RoutingValueSchema
export STAGE_PROMPT_TEMPLATE
export StagedWorkflowDeclSchema
export UNSTICK_SCHEMA
export UNSTICK_SYSTEM_PROMPT
export WorkflowLoader
export WorkflowStepSchema
export buildStageRequest
export buildUnstickPrompt
export buildWorkflowContext
export createGraphBlastRadiusResolver
export crossFieldRoutingIssues
export deriveSeedModules
export deriveVerifyCommands
export discoverSkillCatalog
export discoverSkillCatalogNames
export distillGateFailure
export docToken
export documentStagePath
export executeWorkflow
export findUndocumentedAdditions
export formatUndocumentedReason
export formatUnstickAdvisory
export getDefaultConfig
export isLocalBackendFactory
export needsDoc
export nextTier
export persistStageDocumentFactory
export resolveLeafPrewarm
export resolveLeafPrewarmSources
export resolvePeerUnloadFromConfig
export resolvePeerUnloadTarget
export resolveStageBackendFactory
export resolveStagePrewarmBlock
export routingWarnings
export runStageSession
export runStageWithRetry
export selectStagePromptTemplate
export shouldRequestUnstickAdvice
export stageAttemptKey
export stagePersonaSystemPrompt
export truncateGateOutput
export validateBackendsAndRouting
export validateWorkflowConfig
export workflowFor
```

## Dependency Slice

```
import { AdaptiveRouter } from '../agent/adaptive-router.js'
import { isLocalExecutionBackend } from '../agent/backend-factory.js'
import { BackendRouter } from '../agent/backend-router.js'
import { buildCapabilityRegistry } from '../agent/capability-registry.js'
import { EscalationState } from '../agent/escalation-state.js'
import { OrchestratorBackendFactory } from '../agent/orchestrator-backend-factory'
import { OrchestratorBackendFactory } from '../agent/orchestrator-backend-factory.js'
import { AgentRunner } from '../agent/runner.js'
import { StreamRecorder } from '../core/stream-recorder'
import { StreamRecorder } from '../core/stream-recorder.js'
import { StructuredLogger } from '../logging/logger'
import { StructuredLogger } from '../logging/logger.js'
import { PromptRenderer } from '../prompt/renderer'
import { PromptRenderer } from '../prompt/renderer.js'
import { detectEcosystem } from '../workspace/ecosystem.js'
import { createGraphBlastRadiusResolver } from './comprehension-blast-radius'
import { createGraphBlastRadiusResolver } from './comprehension-blast-radius.js'
import { LeafPrewarmDeps, deriveSeedModules, resolveLeafPrewarm } from './comprehension-prewarm'
import { LeafPrewarmResult, resolveLeafPrewarm } from './comprehension-prewarm.js'
import { getDefaultConfig, validateWorkflowConfig } from './config'
import { docToken, findUndocumentedAdditions, formatUndocumentedReason, needsDoc } from './doc-coverage-gate'
import { WorkflowEngineContext, buildStageRequest, executeWorkflow, nextTier, runStageSession, runStageWithRetry, stageAttemptKey } from './execute-workflow'
import { WorkflowEngineContext } from './execute-workflow.js'
import { distillGateFailure, truncateGateOutput } from './gate-feedback'
import { LOCAL_STAGE_PROMPT_TEMPLATE, selectStagePromptTemplate, stagePersonaSystemPrompt } from './local-stage-prompt'
import { selectStagePromptTemplate, stagePersonaSystemPrompt } from './local-stage-prompt.js'
import { STAGE_PROMPT_TEMPLATE, buildWorkflowContext, deriveVerifyCommands, isLocalBackendFactory, persistStageDocumentFactory, resolveLeafPrewarmSources, resolveStageBackendFactory, resolveStagePrewarmBlock } from './orchestrator-context'
import { resolvePeerUnloadFromConfig, resolvePeerUnloadTarget } from './peer-unload'
import { BackendCapabilitiesSchema, BackendDefSchema, RoadmapAutoTriageSchema, RoadmapConfigSchema, RoutingConfigSchema, RoutingPolicySchema, StagedWorkflowDeclSchema } from './schema'
import { AgentBudgetSchema, BackendDefSchema, RoadmapConfigSchema, RoutingConfigSchema, StagedWorkflowDeclSchema } from './schema.js'
import { discoverSkillCatalogNames } from './skill-catalog'
import { STAGE_PROMPT_TEMPLATE } from './stage-prompt-template.js'
import { DEFAULT_REASONER_ASSIST_AFTER, REASONER_UNSTICK_TIMEOUT_MS, UNSTICK_SCHEMA, buildUnstickPrompt, formatUnstickAdvisory, shouldRequestUnstickAdvice } from './unstick-advisory'
import { CHARS_PER_TOKEN, COMPREHENSION_ROOT, ComprehensionSourceFile, ComprehensionStore, ComprehensionUnit, Err, Ok, Result, SourceFile, computeSourceHash, createNodeComprehensionIO, createNodeModuleSourceReader, renderServedUnit, serveGate } from '@harness-engineering/core'
import { GraphEdge, GraphNode, GraphStore } from '@harness-engineering/graph'
import { RANK_TIER, TIER_RANK } from '@harness-engineering/intelligence'
import { AgentBackend, AgentBudgetConfig, AgentEvent, BackendCapabilities, BackendDef, CapabilityTier, ComplexityVerdict, DEFAULT_RETRIEVAL_MODE, Err, Issue, LeafContextSource, McpServerSpec, Ok, Result, RetrievalMode, RoadmapAutoTriageConfig, RoadmapConfig, RoutingConfig, RoutingDecision, RoutingPolicy, RoutingRequest, RoutingUseCase, RoutingValue, STANDARD_COGNITIVE_MODES, StageRun, StagedWorkflowDecl, TurnResult, WorkflowConfig, WorkflowDefinition, WorkflowExecutionPlan, WorkflowStep } from '@harness-engineering/types'
import * as fs, { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as nodePath, * as path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parse, parseYaml } from 'yaml'
import { z } from 'zod'
```
