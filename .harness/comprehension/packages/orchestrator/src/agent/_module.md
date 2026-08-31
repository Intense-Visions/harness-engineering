---
schemaVersion: 1
module: 'packages/orchestrator/src/agent'
sourceHash: '5ecb531eff7f7aa4ce2a0b90c9b206849a5d558e571804a011a4b32a9bca3478'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adaptive-router.budget-terminal.test.ts',
    'adaptive-router.default-off.test.ts',
    'adaptive-router.live-classify.test.ts',
    'adaptive-router.phase5.test.ts',
    'adaptive-router.privacy-boundary.test.ts',
    'adaptive-router.privacy-terminal.test.ts',
    'adaptive-router.spend.test.ts',
    'adaptive-router.status.test.ts',
    'adaptive-router.test.ts',
    'adaptive-router.ts',
    'analysis-env.ts',
    'analysis-provider-factory.ts',
    'backend-factory.ts',
    'backend-resolver.test.ts',
    'backend-resolver.ts',
    'backend-router.ts',
    'brainstorm-wiring.test.ts',
    'brainstorm-wiring.ts',
    'capability-registry.test.ts',
    'capability-registry.ts',
    'complexity-request.test.ts',
    'complexity-request.ts',
    'config-migration.ts',
    'cost-estimator.test.ts',
    'cost-estimator.ts',
    'escalation-outcome.test.ts',
    'escalation-state.test.ts',
    'escalation-state.ts',
    'harness-fit-runner.composition.test.ts',
    'harness-fit-runner.test.ts',
    'harness-fit-runner.ts',
    'intelligence-factory.ts',
    'live-classify.test.ts',
    'live-classify.ts',
    'local-model-resolver.ts',
    'orchestrator-backend-factory.ts',
    'quality-verdict.test.ts',
    'quality-verdict.ts',
    'runner.ts',
    'subprocess-env.test.ts',
    'subprocess-env.ts',
    'triage-mark.test.ts',
    'triage-mark.ts',
    'triage-outcome.test.ts',
    'triage-outcome.ts',
    'triage-skill-mapping.ts',
    'triage-wiring.test.ts',
    'triage-wiring.ts',
    'use-case-builder.ts',
  ]
---

## Interface Contract

```ts
export AdaptiveRouter
export AgentRunner
export BRAINSTORM_RUBRIC
export BackendRouter
export EscalationState
export HarnessFitProbeRunner
export LANE_STATE_ISOLATION_VAR
export LocalModelResolver
export LocalModelStatus
export OrchestratorBackendFactory
export PrivacyNoMatch
export RankableCandidate
export SUBPROCESS_ENV_ALLOW_VAR
export SUBPROCESS_ENV_PASSTHROUGH_VAR
export TriageVerdict
export applyAnalysisEnv
export brainstormInputFromIssue
export buildAnalysisProvider
export buildAnalysisProviderForLayer
export buildCapabilityRegistry
export buildIntelligencePipeline
export buildProbeInput
export buildRoutingUseCase
export buildSubprocessEnv
export buildTaskText
export buildTriageOutcomeInput
export contextCapFromMemoryGb
export createBackend
export defaultFetchModels
export defaultPoolCapabilities
export defaultWarmModel
export defaultWarmModelViaCompletion
export deriveAnalysisEnv
export enrichIssueWithSpec
export estimateCost
export hasIntroducedSecurityDefect
export isEnvKeyAllowed
export isLaneStateIsolationEnabled
export isLocalEndpointBackend
export isLocalExecutionBackend
export layerOfPath
export makeBackendResolver
export makeGraphScope
export makeLiveClassify
export makeSelForkGenerator
export markApprovedForDispatch
export migrateAgentConfig
export normalizeLocalModel
export outcomeVerdictToQualityFail
export parseIntroducedHunks
export pilotScore
export precedentLookupFromStored
export rankTriageCandidates
export renderSpecMarkdown
export resolveSkillForTriage
export runBrainstormForIssue
export runRetrospective
export selectCheapestQualifying
export signalsFromDiff
export slugFor
export toArray
export triageIssue
```

## Dependency Slice

```
import { artifactPresenceFromIssue, detectScopeTier } from '../core/model-router'
import { extractRateLimitReset } from '../core/rate-limit-events'
import { TriageSkill, triageIssue } from '../core/triage-router'
import { HarnessFitProbeRunner } from '../index.js'
import { StructuredLogger } from '../logging/logger'
import { Orchestrator } from '../orchestrator.js'
import { RoutingDecisionBus } from '../routing/decision-bus.js'
import { buildStageRequest } from '../workflow/execute-workflow.js'
import { SkillCatalogEntry } from '../workflow/skill-catalog'
import { AdaptiveRouter } from './adaptive-router.js'
import { buildAnalysisProvider } from './analysis-provider-factory'
import { CreateBackendOptions, createBackend, isLocalEndpointBackend } from './backend-factory.js'
import { makeBackendResolver } from './backend-resolver.js'
import { BackendRouter } from './backend-router'
import { BackendRouter } from './backend-router.js'
import { AnthropicBackend } from './backends/anthropic.js'
import { ClaudeBackend, PolicyAuditSink } from './backends/claude.js'
import { CodexBackend } from './backends/codex.js'
import { ContainerBackend } from './backends/container.js'
import { GeminiBackend } from './backends/gemini.js'
import { LocalBackend } from './backends/local.js'
import { MockBackend } from './backends/mock.js'
import { OllamaBackend } from './backends/ollama.js'
import { OpenAIBackend } from './backends/openai.js'
import { PiBackend } from './backends/pi.js'
import { OciServerlessBackend } from './backends/serverless.js'
import { SshBackend } from './backends/ssh.js'
import { BRAINSTORM_RUBRIC, brainstormInputFromIssue, enrichIssueWithSpec, makeSelForkGenerator, renderSpecMarkdown, runBrainstormForIssue } from './brainstorm-wiring.js'
import { PrivacyNoMatch, SelectConstraints, buildCapabilityRegistry, defaultPoolCapabilities, selectCheapestQualifying } from './capability-registry.js'
import { buildTaskText } from './complexity-request.js'
import { estimateCost } from './cost-estimator.js'
import { EscalationState } from './escalation-state.js'
import { HarnessFitProbeRunner, HarnessFitProbeRunnerDeps } from './harness-fit-runner.js'
import { makeLiveClassify } from './live-classify.js'
import { LocalModelResolver } from './local-model-resolver'
import { hasIntroducedSecurityDefect, outcomeVerdictToQualityFail, parseIntroducedHunks } from './quality-verdict'
import { IntroducedHunk } from './quality-verdict.js'
import { AgentRunner } from './runner.js'
import { DockerRuntime } from './runtime/docker.js'
import { createSecretBackend } from './secrets/index.js'
import { LANE_STATE_ISOLATION_VAR, SUBPROCESS_ENV_ALLOW_VAR, SUBPROCESS_ENV_PASSTHROUGH_VAR, buildSubprocessEnv, isEnvKeyAllowed, isLaneStateIsolationEnabled } from './subprocess-env'
import { TriageMarkItem, markApprovedForDispatch } from './triage-mark.js'
import { buildTriageOutcomeInput, layerOfPath, precedentLookupFromStored, runRetrospective, signalsFromDiff } from './triage-outcome.js'
import { resolveSkillForTriage } from './triage-skill-mapping'
import { TriageWiringDeps, buildProbeInput, makeGraphScope, triageIssue } from './triage-wiring.js'
import { CacheMetricsRecorder, FeatureMutation, RoadmapStore, SecurityScanner, buildLaneStateEnvOverride, eventSourcing, slugifyFeatureName } from '@harness-engineering/core'
import { CascadeSimulator, GraphNode, GraphStore } from '@harness-engineering/graph'
import { AnalysisProvider, AnalysisResponse, AnthropicAnalysisProvider, BrainstormInput, BrainstormOutcome, ClassifyInput, ClaudeCliAnalysisProvider, ComplexitySignals, DEFAULT_DEGRADE_AT_PCT, Fork, ForkConfidence, ForkDecision, ForkGenerator, GoNoGoCandidate, GraphScope, IntelligencePipeline, OpenAICompatibleAnalysisProvider, OutcomeVerdict, PrecedentLookup, PrecedentRate, ProbeConfig, ProbeInput, RANK_TIER, RankableCandidate, ResolvedEntity, RetrospectiveComparison, RetrospectiveConfig, SpecDraft, TIER_RANK, TriagePrediction, TriageVerdict, aggregatePrecedent, classify, compareToPrediction, depthForLevel, deriveRequiredTier, dispatchableShapeKey, extractEntities, pilotScore, rankTriageCandidates, runAutoBrainstorm, runScopingProbe } from '@harness-engineering/intelligence'
import { HarnessFitProbeTask, HarnessFitResult, HarnessFitRunner, PoolCandidateOptions, PoolStateProvider, RankProfile, poolStateToCandidates, scoreBuildQuality } from '@harness-engineering/local-models'
import { AgentBackend, AgentConfig, AgentError, AgentEvent, AgentSession, AnthropicBackendDef, BackendCapabilities, BackendCapabilityRegistry, BackendDef, CapabilityTier, ClaudeBackendDef, ComplexityVerdict, ContainerConfig, FeatureStatus, GeminiBackendDef, IntelligenceConfig, IsolationTier, Issue, IssueTrackerClient, LocalBackendDef, LocalModelStatus, MockBackendDef, Ok, OpenAIBackendDef, PiBackendDef, PolicyNetworkMode, PolicySandboxMode, PrivacyClass, ResolutionSource, ResolutionStep, Result, Roadmap, RoadmapFeature, RoutingBudgetStatus, RoutingConfig, RoutingDecision, RoutingError, RoutingPolicy, RoutingRequest, RoutingStatus, RoutingTaskText, RoutingTelemetry, RoutingTelemetryDecision, RoutingUseCase, RoutingValue, ScopeTier, SecretConfig, SessionStartParams, TurnParams, TurnResult, WorkflowConfig } from '@harness-engineering/types'
import * as childProcess, { execFile, execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path, path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
