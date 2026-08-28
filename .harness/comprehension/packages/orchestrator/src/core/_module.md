---
schemaVersion: 1
module: "packages/orchestrator/src/core"
sourceHash: "d45a248e1442639d27ec4277f0c3d9c3c3c55b5149d31ad38cdc31afbe3b1c9e"
compiledAt: "2026-08-28T01:22:12.292Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analysis-archive.ts", "analysis-comment.ts", "budget-governor.ts", "candidate-selection.ts", "claim-manager.ts", "concurrency.ts", "context-budget-governor.test.ts", "context-budget-governor.ts", "flight-recorder.test.ts", "flight-recorder.ts", "highlight-extractor.ts", "index.ts", "interaction-queue.test.ts", "interaction-queue.ts", "lane-persistence.ts", "model-router.ts", "orchestrator-identity.ts", "pr-detector.ts", "published-index.ts", "rate-limit-events.ts", "rate-limiter.ts", "reconciliation.ts", "retry.ts", "stall-detector.ts", "state-helpers.ts", "state-machine.ts", "stream-recorder.ts", "triage-router.ts"]
---

## Summary

**packages/orchestrator/src/core** is the orchestrator's coordination and state-management kernel. It provides immutable, event-driven abstractions for budget enforcement, forensic logging, async interaction management, and issue routing.

The module splits into six load-bearing subsystems: (1) Budget Governor enforces per-period token spend envelopes (global + per-fleet) with auto-rolling windows; dispatch halts cleanly at lane boundaries once budgets exhaust. (2) Flight Recorder persists forensic audit trails to `.harness/black-box/<runId>/run.json` (verdicts, gate reasons, SideEffects—not rendered prompts). (3) Interaction Queue buffers async question/answer cycles and replays them on state transitions. (4) Analysis Archive stores intelligence pipeline results (spec, complexity, simulation) keyed by issueId—one file per issue, overwrites on re-analysis. (5) Model Router classifies issues by scope tier (MICRO/SMALL/MEDIUM/LARGE) to determine artifact presence rules and backend routing. (6) Triage & Reconciliation selects lanes by heuristics (assignee, milestone, state) and reconciles published index with live tracker state to detect stale rows.

## Invariants

- Budget window immutability: every event clones OrchestratorState including BudgetState; windows roll on read (not write), so elapsed periods always report zero spend until the next transition
- Lane-boundary graceful stop: dispatch halts at lane boundaries once budget exhausts; lanes in flight complete undisturbed; global exhaustion stops all fleets, fleet exhaustion stops only that fleet
- One analysis per issue: AnalysisArchive overwrites on save—latest analysis always wins, issueId is canonical key
- Scope tier gates artifacts: detectScopeTier drives artifact synthesis and routing decisions; LARGE issues skip synthesis artifacts and route to heavyweight models
- Flight record captures verdicts and gate reasons but NOT rendered prompts—read those from orchestrator state seam or run the render path independently
- Per-fleet spend tracked separately: fleet budgets slice the global envelope; a fleet's exhaustion does not affect sibling fleets sharing the same global bucket
- Interaction closure before ship: pending interactions must be resolved or explicitly cleared before a run ships—unresolved interactions block finalization
- Triage eligibility is state-aware: only issues in activeStates (planned/in-progress) are eligible for dispatch; stale rows in published index are detected and marked for re-sync

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
