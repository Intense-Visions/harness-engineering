---
schemaVersion: 1
module: "packages/orchestrator/src/agent"
sourceHash: "690ac7311a1629604330b471e92b1e5f405b13c04df751eff6de141922cdd6fc"
compiledAt: "2026-08-28T01:22:12.315Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["adaptive-router.budget-terminal.test.ts", "adaptive-router.default-off.test.ts", "adaptive-router.live-classify.test.ts", "adaptive-router.phase5.test.ts", "adaptive-router.privacy-boundary.test.ts", "adaptive-router.privacy-terminal.test.ts", "adaptive-router.spend.test.ts", "adaptive-router.status.test.ts", "adaptive-router.test.ts", "adaptive-router.ts", "analysis-env.ts", "analysis-provider-factory.ts", "backend-factory.ts", "backend-resolver.test.ts", "backend-resolver.ts", "backend-router.ts", "brainstorm-wiring.test.ts", "brainstorm-wiring.ts", "capability-registry.test.ts", "capability-registry.ts", "complexity-request.test.ts", "complexity-request.ts", "config-migration.ts", "cost-estimator.test.ts", "cost-estimator.ts", "escalation-outcome.test.ts", "escalation-state.test.ts", "escalation-state.ts", "harness-fit-runner.composition.test.ts", "harness-fit-runner.test.ts", "harness-fit-runner.ts", "intelligence-factory.ts", "live-classify.test.ts", "live-classify.ts", "local-model-resolver.ts", "orchestrator-backend-factory.ts", "quality-verdict.test.ts", "quality-verdict.ts", "runner.ts", "subprocess-env.test.ts", "subprocess-env.ts", "triage-mark.test.ts", "triage-mark.ts", "triage-outcome.test.ts", "triage-outcome.ts", "triage-skill-mapping.ts", "triage-wiring.test.ts", "triage-wiring.ts", "use-case-builder.ts"]
---

## Summary

`packages/orchestrator/src/agent` is the intelligent routing and execution layer for the orchestrator. It decides which backend and tier to use for a given task, executes agents against those backends, and evaluates output quality. The module splits into five concerns: (1) **Backend Resolution** via `AdaptiveRouter` and `BackendRouter` — routes work to Claude, OpenAI, Gemini, Ollama, or local models based on cost/privacy/capability constraints; (2) **Agent Execution** via `AgentRunner` and `HarnessFitProbeRunner` — manages backend session lifecycle and turn management; (3) **Intelligent Classification** via `triageIssue` and `classify` — analyzes issues to predict work type and tier, building LLM-backed analysis providers; (4) **Quality Verdicts** via `hasIntroducedSecurityDefect` and `parseIntroducedHunks` — post-execution security and code scanning; (5) **Spec Wiring** via `brainstormInputFromIssue` and `runBrainstormForIssue` — converts issues to reasoning prompts and executes specification generation.

## Invariants

- Budget exhaustion is terminal, not a retry loop. When onBudgetExhausted='human', route() throws RoutingError('budget-exhausted'), surfaces ONE steward escalation, enqueues zero retries, and reaches terminal state immediately.
- Default-off adopter-portability: with no routing.policy configured, AdaptiveRouter must NOT construct and dispatch resolution must be byte-identical to BackendRouter.
- Privacy and budget fail-closed are terminal paths. Both surface steward escalation, no auto-retry, and drive units to terminal state without fallthrough to retry branches.
- Per-phase backend routing enforced: design phase routes to thinking-enabled backends; execution phase routes to non-thinking coders (e.g. Codex). Split enforced via deriveAnalysisEnv + buildAnalysisProviderForLayer.
- Environment variable allowlisting is mandatory. Subprocess spawns (local models, Docker, SSH) pass only allowlisted keys via isEnvKeyAllowed + buildSubprocessEnv to prevent credential leakage.
- Analysis provider routing is config-aware. buildAnalysisProvider routes to correct provider (Anthropic, Claude CLI, OpenAI, OllamaBackend) based on backend config and execution layer. Mismatch breaks intelligence gates.
- Local model normalization is stable. LocalModelResolver canonicalizes endpoint URIs and LocalModelStatus enum (ready, loading, failed, not-installed). Stale or mismatched status breaks pool dispatch.
- Security defects block ship. hasIntroducedSecurityDefect + parseIntroducedHunks scan for introduced vulnerabilities; any defect surfaces via outcomeVerdictToQualityFail to block gates without explicit override.

## Interface Contract

```ts
export AdaptiveRouter
export AgentRunner
export BRAINSTORM_RUBRIC
export BackendRouter
export EscalationState
export HarnessFitProbeRunner
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
import { SUBPROCESS_ENV_ALLOW_VAR, SUBPROCESS_ENV_PASSTHROUGH_VAR, buildSubprocessEnv, isEnvKeyAllowed } from './subprocess-env'
import { TriageMarkItem, markApprovedForDispatch } from './triage-mark.js'
import { buildTriageOutcomeInput, layerOfPath, precedentLookupFromStored, runRetrospective, signalsFromDiff } from './triage-outcome.js'
import { resolveSkillForTriage } from './triage-skill-mapping'
import { TriageWiringDeps, buildProbeInput, makeGraphScope, triageIssue } from './triage-wiring.js'
import { CacheMetricsRecorder, FeatureMutation, RoadmapStore, SecurityScanner, eventSourcing, slugifyFeatureName } from '@harness-engineering/core'
import { CascadeSimulator, GraphNode, GraphStore } from '@harness-engineering/graph'
import { AnalysisProvider, AnalysisResponse, AnthropicAnalysisProvider, BrainstormInput, BrainstormOutcome, ClassifyInput, ClaudeCliAnalysisProvider, ComplexitySignals, DEFAULT_DEGRADE_AT_PCT, Fork, ForkConfidence, ForkDecision, ForkGenerator, GoNoGoCandidate, GraphScope, IntelligencePipeline, OpenAICompatibleAnalysisProvider, OutcomeVerdict, PrecedentLookup, PrecedentRate, ProbeConfig, ProbeInput, RANK_TIER, RankableCandidate, ResolvedEntity, RetrospectiveComparison, RetrospectiveConfig, SpecDraft, TIER_RANK, TriagePrediction, TriageVerdict, aggregatePrecedent, classify, compareToPrediction, depthForLevel, deriveRequiredTier, dispatchableShapeKey, extractEntities, pilotScore, rankTriageCandidates, runAutoBrainstorm, runScopingProbe } from '@harness-engineering/intelligence'
import { HarnessFitProbeTask, HarnessFitResult, HarnessFitRunner, PoolCandidateOptions, PoolStateProvider, RankProfile, poolStateToCandidates, scoreBuildQuality } from '@harness-engineering/local-models'
import { AgentBackend, AgentConfig, AgentError, AgentEvent, AgentSession, AnthropicBackendDef, BackendCapabilities, BackendCapabilityRegistry, BackendDef, CapabilityTier, ClaudeBackendDef, ComplexityVerdict, ContainerConfig, FeatureStatus, GeminiBackendDef, IntelligenceConfig, IsolationTier, Issue, IssueTrackerClient, LocalBackendDef, LocalModelStatus, MockBackendDef, Ok, OpenAIBackendDef, PiBackendDef, PolicyNetworkMode, PolicySandboxMode, PrivacyClass, ResolutionSource, ResolutionStep, Result, Roadmap, RoadmapFeature, RoutingBudgetStatus, RoutingConfig, RoutingDecision, RoutingError, RoutingPolicy, RoutingRequest, RoutingStatus, RoutingTaskText, RoutingTelemetry, RoutingTelemetryDecision, RoutingUseCase, RoutingValue, ScopeTier, SecretConfig, SessionStartParams, TurnParams, TurnResult, WorkflowConfig } from '@harness-engineering/types'
import * as childProcess, { execFile, execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
