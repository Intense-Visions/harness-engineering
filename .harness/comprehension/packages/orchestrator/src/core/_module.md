---
schemaVersion: 1
module: 'packages/orchestrator/src/core'
sourceHash: '078d626c02b18d54734464d03d04aafae2ac517b9f204a6927fcd692c1c2135a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analysis-archive.ts',
    'analysis-comment.ts',
    'budget-governor.ts',
    'candidate-selection.ts',
    'claim-manager.ts',
    'concurrency.ts',
    'context-budget-governor.test.ts',
    'context-budget-governor.ts',
    'flight-recorder.test.ts',
    'flight-recorder.ts',
    'highlight-extractor.ts',
    'index.ts',
    'interaction-queue.test.ts',
    'interaction-queue.ts',
    'lane-persistence.ts',
    'model-router.ts',
    'orchestrator-identity.ts',
    'pr-detector.ts',
    'published-index.ts',
    'rate-limit-events.ts',
    'rate-limiter.ts',
    'reconciliation.ts',
    'retry.ts',
    'stall-detector.ts',
    'state-helpers.ts',
    'state-machine.ts',
    'stream-recorder.ts',
    'triage-router.ts',
  ]
---

## Interface Contract

```ts
export AnalysisArchive
export AnalysisRecord
export ApplyEventResult
export ArtifactPresence
export AttemptStats
export BudgetState
export ClaimManager
export ClaimManagerConfig
export DispatchBudgetOptions
export ExecFileFn
export FlightRecorder
export Highlight
export HighlightsInfo
export InteractionQueue
export ORCHESTRATOR_IDENTITY_FILE
export OrchestratorEvent
export PRDetector
export PRDetectorLogger
export PendingInteraction
export PublishedIndex
export RateLimitComputeSnapshot
export RateLimitConfig
export RunProvenance
export RunRecord
export SideEffect
export StreamManifest
export StreamRecorder
export TriageConfig
export TriageDecision
export TriageSignals
export TriageSkill
export UnitVerdict
export Verdict
export applyEvent
export artifactPresenceFromIssue
export assertIssueWithinContextBudget
export calculateRetryDelay
export canAffordDispatch
export canDispatch
export cloneBudgetState
export computeRateLimitDelay
export createBudgetState
export createEmptyState
export detectScopeTier
export estimateIssueContextTokens
export extractHighlights
export extractTitlePrefix
export fleetKeyForIssue
export gatherProvenance
export getAvailableSlots
export getBudgetStatus
export getPerStateCount
export isEligible
export isFleetAllocationExhausted
export isGlobalEnvelopeExhausted
export loadPublishedIndex
export periodLengthMs
export reconcile
export recordBudgetSpend
export renderAnalysisComment
export renderPRComment
export resolveEscalationConfig
export resolveOrchestratorId
export rollBudgetPeriod
export routeIssue
export savePublishedIndex
export selectCandidates
export sortCandidates
export triageIssue
```

## Dependency Slice

```
import { ClaimEffect, EscalateEffect, OrchestratorEvent, SideEffect, TickEvent } from '../types/events'
import { LiveSession, OrchestratorState, RunAttemptPhase, RunningEntry } from '../types/internal'
import { getDefaultConfig } from '../workflow/config'
import { AnalysisRecord } from './analysis-archive'
import { canAffordDispatch, cloneBudgetState, createBudgetState, fleetKeyForIssue, isFleetAllocationExhausted, isGlobalEnvelopeExhausted, recordBudgetSpend } from './budget-governor'
import { selectCandidates } from './candidate-selection'
import { DispatchBudgetOptions, canDispatch } from './concurrency'
import { assertIssueWithinContextBudget, buildLeafContextEstimate, estimateIssueContextTokens } from './context-budget-governor'
import { FlightRecorder, RunRecord, gatherProvenance } from './flight-recorder'
import { InteractionQueue, PendingInteraction } from './interaction-queue'
import { artifactPresenceFromIssue, detectScopeTier, routeIssue } from './model-router'
import { extractRateLimitReset } from './rate-limit-events'
import { reconcile } from './reconciliation'
import { calculateRetryDelay } from './retry'
import { AttemptStats, Highlight } from './stream-recorder'
import { CHARS_PER_TOKEN, ComprehensionSourceFile, ComprehensionUnit, ContextBudgetExceededError, Issue, IssueTrackerClient, assertLeafWithinBudget, computeSourceHash, coreIsFleetAllocationExhausted, coreIsGlobalEnvelopeExhausted, eventSourcing, renderServedUnit } from '@harness-engineering/core'
import { ComplexityScore, EnrichedSpec, SimulationResult } from '@harness-engineering/intelligence'
import { AgentBudgetConfig, AgentEvent, BudgetEnvelopeStatus, ConcernSignal, Err, EscalationConfig, FleetBudgetStatus, Issue, IssueRoutingDecision, LeafContextEstimate, LeafContextSource, Ok, Result, ScopeTier, WorkflowConfig } from '@harness-engineering/types'
import { execFile, execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import * as fs, { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
