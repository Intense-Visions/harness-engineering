---
schemaVersion: 1
module: "packages/orchestrator/src/workflow"
sourceHash: "1e7638227307b0dd3d2a4428783f98d94f9f20558aeb542a8c8449d107331fdc"
compiledAt: "2026-08-28T01:22:12.582Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["comprehension-prewarm.test.ts", "comprehension-prewarm.ts", "config.staged-routing.test.ts", "config.ts", "doc-coverage-gate.test.ts", "doc-coverage-gate.ts", "execute-workflow.4b.test.ts", "execute-workflow.staged-integration.test.ts", "execute-workflow.test.ts", "execute-workflow.ts", "gate-feedback.test.ts", "gate-feedback.ts", "loader.ts", "local-stage-prompt.test.ts", "local-stage-prompt.ts", "orchestrator-context.prewarm-seam.test.ts", "orchestrator-context.ts", "peer-unload.test.ts", "peer-unload.ts", "persist-stage-document.test.ts", "schema.acceptance.test.ts", "schema.amr-config.test.ts", "schema.expects.test.ts", "schema.roadmap-triage.test.ts", "schema.ts", "skill-catalog.ts", "stage-backend-routing.test.ts", "stage-prompt-template.ts", "unstick-advisory.test.ts", "unstick-advisory.ts", "workflow-for.ts"]
---

## Summary

The workflow module orchestrates multi-stage task execution with pluggable backends, pre-warmed comprehension context, and gate-based quality enforcement. It routes each stage to a backend (local coder, reasoning model, or adaptive choice) based on cognitive mode, validates configuration (especially backend routing and doc coverage), and handles retries with tier escalation when stages fail. Pre-warming injects issue-referenced module summaries into dispatch without calling an LLM—degrading gracefully when comprehension units are missing or stale. Documentation gates block merge until edited files are linked from docs. The module is the glue between task definition, LLM backends, and enforcement rules.

## Invariants

- Pre-warming is LLM-free and always safe — seed modules come from issue title/description/spec paths plus direct graph deps; only fresh units (source-hash verified) are served via serveGate; any store/read/serve failure silently returns an empty block; the stage prompt renders byte-identical to today.
- Backend routing is per-stage, not per-workflow — each stage's cognitiveMode maps to routing.modes[X] in harness.config.json; design phases route to reasoning backends, execution phases to non-thinking coders; validation fails fast if a stage declares an unmapped mode.
- Staged workflows retry with tier escalation, not replay — nextTier() moves from low→medium→high confidence on gate failure; each retry lives under a new attempt key; only the failed tier retries with stronger heuristics.
- Comprehension units are source-hash verified — a unit is served only if its stored source hash matches the live source; stale or missing sources produce an empty block, never a mismatch hallucination.
- Documentation gate is link-based and pre-push fresh — a file counts documented only if docs/ markdown links its basename (JSDoc doesn't count); pre-push blocks if reference docs are stale.
- Gate feedback is distilled for reuse — distillGateFailure + truncateGateOutput extract actionable summaries; raw LLM output is capped and passed forward to the next retry, preventing context bloat.
- Skill catalog is discovered at runtime, not hardcoded — enables portable features across adopters (one harness, many repos).
- Peer unload coordination prevents cascade — resolvePeerUnloadTarget detects live peers on the same issue; avoids redundant dispatch and cross-run conflicts.

## Interface Contract

```ts
export AgentBudgetSchema
export BackendCapabilitiesSchema
export BackendDefSchema
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
