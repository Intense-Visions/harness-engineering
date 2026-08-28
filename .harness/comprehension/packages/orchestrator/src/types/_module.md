---
schemaVersion: 1
module: "packages/orchestrator/src/types"
sourceHash: "d6d324241b4d7dcfa61e0c83ab638a86511fed9484dbc80c9e89e0b6b5a4c0b2"
compiledAt: "2026-08-28T01:22:12.430Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["events.ts", "index.ts", "internal.test.ts", "internal.ts", "orchestrator-context.ts"]
---

## Summary

The `types` module defines the event-driven state machine contract for the orchestrator across three layers: discriminated-union event types (`TickEvent`, `WorkerExitEvent`, `AgentUpdateEvent`, `RetryFiredEvent`, `StallDetectedEvent`, `ClaimRejectedEvent`), side-effect types (`DispatchEffect`, `StopEffect`, `ScheduleRetryEffect`, `ReleaseClaimEffect`, `CleanWorkspaceEffect`, `UpdateTokensEffect`, `EmitLogEffect`, `EscalateEffect`, `ClaimEffect`), and the authoritative in-memory state shape (`OrchestratorState`). Events are data that callers construct from subprocess results; the reducer is pure and returns effects for the caller to execute. Intelligence pipeline outputs (concern signals, enriched specs, complexity scores, simulation results, persona recommendations, prewarm sources) are pre-computed outside the reducer and threaded through `TickEvent` as optional maps. State tracks active workers (`RunningEntry`), retry queue entries (`RetryEntry`), live subprocess metadata (`LiveSession`), and global rate/token limits. Split-routing support enables staged workflows to track per-stage state independently from issue-level state.

## Invariants

- Pure state machine: events and effects are data; the orchestrator loop is the I/O boundary; callers construct events from subprocess results; reducer returns effects for caller execution
- Intelligence pipeline pre-computed: concern signals, enriched specs, complexity scores, simulation results, persona recommendations, and prewarm sources are optional maps in TickEvent, computed outside the pure reducer (no disk I/O)
- Split-routing (P1): workflow entries track workflow, currentStageIndex, and stageRuns[] (per-stage session/abort live there); non-workflow entries omit these fields entirely
- Distributed claim racing: claimed set tracks issued claims; ClaimRejectedEvent increments rejection counter when peer wins race; callers emit ClaimEffect to attempt claim
- Budget state optional: null when agent.budget unconfigured (governor off, unbounded); canDispatch refuses new lanes once envelope spent
- Prewarm comprehension attribution (SF5.2 #1524): prewarmSources maps issueId to compact served units; threads into per-leaf context-budget consult so cost measured against actual delivered units, not raw source; absent ⇒ fallback to floor-only estimate
- Grace period on completed: completed map stores issueId with epoch-ms timestamp to allow roadmap re-activation without duplicate dispatch on immediate next tick
- Capability tier routing feedback loop: lastRoutedTier (from AdaptiveRouter) captured on dispatch so quality outcome can feed back into AdaptiveRouter.recordOutcome()
- WorkerExitEvent attempt nullable: attempt: number | null allows retries, non-workflow runs, and escalated tasks to report exit without numbered attempt

## Interface Contract

```ts
export AgentUpdateEvent
export CleanWorkspaceEffect
export DispatchEffect
export EmitLogEffect
export EscalateEffect
export LiveSession
export OrchestratorContext
export OrchestratorEvent
export OrchestratorState
export RateLimitSnapshot
export ReleaseClaimEffect
export RetryEntry
export RetryFiredEvent
export RunAttemptPhase
export RunningEntry
export ScheduleRetryEffect
export SideEffect
export StallDetectedEvent
export StopEffect
export TickEvent
export TokenTotals
export UpdateTokensEffect
export WorkerExitEvent
```

## Dependency Slice

```
import { AnalysisArchive } from '../core/analysis-archive'
import { BudgetState } from '../core/budget-governor'
import { PRDetector } from '../core/pr-detector'
import { StreamRecorder } from '../core/stream-recorder'
import { StructuredLogger } from '../logging/logger'
import { OrchestratorState, RunningEntry } from './internal'
import { IssueTrackerClient } from '@harness-engineering/core'
import { GraphStore } from '@harness-engineering/graph'
import { ComplexityScore, EnrichedSpec, IntelligencePipeline, SimulationResult, WeightedRecommendation } from '@harness-engineering/intelligence'
import { AgentEvent, ConcernSignal, Issue, LeafContextSource, StageRun, TokenUsage, WorkflowConfig, WorkflowExecutionPlan } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
