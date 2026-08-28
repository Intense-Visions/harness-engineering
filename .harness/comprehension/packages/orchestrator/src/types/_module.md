---
schemaVersion: 1
module: 'packages/orchestrator/src/types'
sourceHash: 'd6d324241b4d7dcfa61e0c83ab638a86511fed9484dbc80c9e89e0b6b5a4c0b2'
compiledAt: '2026-08-28T01:22:12.430Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['events.ts', 'index.ts', 'internal.test.ts', 'internal.ts', 'orchestrator-context.ts']
---

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
