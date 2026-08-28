---
schemaVersion: 1
module: 'packages/orchestrator/src/intelligence'
sourceHash: '150db25c9eb21a2511f536f67eaa07b64db01bfdce7be70c3007e6ca8834b238'
compiledAt: '2026-08-28T01:22:12.199Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['index.ts', 'pipeline-runner.behavior.test.ts', 'pipeline-runner.test.ts', 'pipeline-runner.ts']
---

## Interface Contract

```ts
export IntelligencePipelineRunner
export TickActivityCallback
```

## Dependency Slice

```
import { AnalysisRecord } from '../core/analysis-archive'
import { renderAnalysisComment } from '../core/analysis-comment'
import { artifactPresenceFromIssue, detectScopeTier } from '../core/model-router'
import { loadPublishedIndex, savePublishedIndex } from '../core/published-index'
import { resolveEscalationConfig } from '../core/state-machine'
import { OrchestratorContext } from '../types/orchestrator-context'
import { IntelligencePipelineRunner, TickActivityCallback } from './pipeline-runner'
import { GitHubIssuesSyncAdapter, TrackerSyncAdapter, loadTrackerSyncConfig } from '@harness-engineering/core'
import { ComplexityScore, EnrichedSpec, SimulationResult, WeightedRecommendation, refreshProfiles, weightedRecommendPersona } from '@harness-engineering/intelligence'
import { ConcernSignal, Issue } from '@harness-engineering/types'
import * as fs from 'fs'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
