---
schemaVersion: 1
module: "packages/orchestrator/src/intelligence"
sourceHash: "150db25c9eb21a2511f536f67eaa07b64db01bfdce7be70c3007e6ca8834b238"
compiledAt: "2026-08-28T01:22:12.199Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["index.ts", "pipeline-runner.behavior.test.ts", "pipeline-runner.test.ts", "pipeline-runner.ts"]
---

## Summary

The `intelligence` module houses `IntelligencePipelineRunner`, which orchestrates spec enrichment, complexity scoring, and persona recommendation for candidate issues. It acts as a steady-state analysis loop: given a batch of issues each tick, it enriches them via the shared intelligence pipeline (if eligible), simulates persona-estimated success likelihood (PESL), and archives the results. The runner is resilient to transient failures—analysis errors cache per-issue (preventing thrash on retry), connection errors trip a circuit breaker with configurable threshold, and archive failures are swallowed. Eligibility filtering skips auto-execute scopes (`scope:quick-fix`) and previously-failed issues. Concern signals are emitted for high-unknowns (>3) and high-ambiguities (>5) conditions. Results feed downstream persona routing and escalation decisions.

## Invariants

- Spec cross-tick persistence: Enriched specs are written to ctx.enrichedSpecsByIssue and survive across runner ticks, avoiding redundant pipeline calls.
- Non-fatal analysis failures: Parse/validation errors are cached in analysisFailureCache per-issueId; failed issues are silently skipped on subsequent ticks and never escalate to abort the batch.
- Connection-error circuit breaker: Consecutive connection errors (ECONNREFUSED, fetch timeouts) abort further analysis and cache all remaining candidates in the batch; threshold is configurable via config.intelligence.circuitBreakerThreshold (default 2).
- Auto-execute scope short-circuit: Issues labeled scope:quick-fix are skipped entirely—no pipeline, no archive, no signals.
- SEL simulation conditional: PESL simulation runs only if both a spec and a complexity score exist for the issue; cached specs without fresh scores skip simulation.
- Signal-only results: Issues with no base signals and no threshold signals produce empty result maps (no entry in concernSignals).
- Archive tolerance: Save failures log but do not prevent result return; partial archives are acceptable.
- Threshold-signal invariants: High-unknowns and high-ambiguities signals are appended only when unknowns > 3 or ambiguities > 5 (strictly greater than, not inclusive).
- Callback invocation: TickActivityCallback (the tick function) is invoked for each candidate, allowing upstream state tracking and early termination.

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
