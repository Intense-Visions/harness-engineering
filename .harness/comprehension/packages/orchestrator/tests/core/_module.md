---
schemaVersion: 1
module: "packages/orchestrator/tests/core"
sourceHash: "a1f06a6a058c708937e730ec4c164e6fa6538bab87ab91757d7c18150a34b91a"
compiledAt: "2026-08-28T01:22:12.707Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analysis-archive.test.ts", "analysis-comment.test.ts", "auto-publish.test.ts", "budget-governor.behavior.test.ts", "budget-governor.wired.test.ts", "candidate-selection.test.ts", "circuit-breaker.test.ts", "claim-manager.test.ts", "concurrency.test.ts", "heartbeat.test.ts", "highlight-extractor.test.ts", "interaction-queue.test.ts", "lane-effect-persistence.test.ts", "lane-persistence.test.ts", "lane-readback.test.ts", "model-router.test.ts", "orchestrator-identity.test.ts", "published-index.test.ts", "rate-limit.test.ts", "rate-limiter.test.ts", "reconciliation.test.ts", "retry.test.ts", "stale-claim.test.ts", "stall-detector.test.ts", "startup-reconciliation.test.ts", "state-machine.test.ts", "stream-recorder.test.ts", "tick-jitter.test.ts", "triage-router.test.ts"]
---

## Summary

This test suite validates the orchestrator's core data-flow infrastructure: analysis persistence, publication tracking, and comment rendering. Three main test files cover AnalysisArchive (file-based storage for enriched issue analysis with round-trip fidelity and path-safety), AnalysisComment (markdown rendering with embedded discriminator JSON for auto-publish deduplication), and auto-publish flow (integration of config discovery, published-index tracking, and comment persistence). The module sits at the data model layer and does not test dispatch logic, gating, or backend invocation.

## Invariants

- AnalysisRecord shape is load-bearing — issueId (primary key), identifier, spec, score, simulation, analyzedAt, externalId must all round-trip faithfully through JSON serialization.
- Path safety gates — issueIds must not escape the archive directory; get() returns null on escape attempts, save() throws.
- Latest-wins overwrite — duplicate issueId entries keep only the most recent record; list/get operations never surface stale versions.
- Null normalization — missing or deleted externalId fields always normalize to null (not undefined), so legacy records merge correctly with new schema.
- Directory auto-creation — archive directory is created on first save() even if nested; doesn't pre-require setup.
- Graceful rendering with partial data — renderAnalysisComment() handles null score, null spec, and null simulation without breaking; comment still embeds discriminator JSON.
- Published-index deduplication — loadPublishedIndex() + savePublishedIndex() gate repeated publication of the same record by externalId.

## Interface Contract

```ts

```

## Dependency Slice

```
import { MockBackend } from '../../src/agent/backends/mock'
import { AnalysisArchive, AnalysisRecord } from '../../src/core/analysis-archive'
import { renderAnalysisComment } from '../../src/core/analysis-comment'
import { canAffordDispatch, createBudgetState, fleetKeyForIssue, getBudgetStatus, periodLengthMs, recordBudgetSpend, rollBudgetPeriod } from '../../src/core/budget-governor'
import { isEligible, selectCandidates, sortCandidates } from '../../src/core/candidate-selection'
import { ClaimManager } from '../../src/core/claim-manager'
import { canDispatch, getAvailableSlots, getPerStateCount } from '../../src/core/concurrency'
import { extractHighlights, renderPRComment } from '../../src/core/highlight-extractor'
import { loadPublishedIndex, renderAnalysisComment, savePublishedIndex } from '../../src/core/index'
import { InteractionQueue, PendingInteraction } from '../../src/core/interaction-queue'
import { OrchestratorLaneSignal, mapOrchestratorLane, persistLane } from '../../src/core/lane-persistence'
import { detectScopeTier, routeIssue } from '../../src/core/model-router'
import from '../../src/core/orchestrator-identity'
import { loadPublishedIndex, savePublishedIndex } from '../../src/core/published-index'
import { computeRateLimitDelay } from '../../src/core/rate-limiter'
import { reconcile } from '../../src/core/reconciliation'
import { calculateRetryDelay } from '../../src/core/retry'
import { detectStalledIssues } from '../../src/core/stall-detector'
import { createEmptyState } from '../../src/core/state-helpers'
import { applyEvent } from '../../src/core/state-machine'
import { StreamRecorder } from '../../src/core/stream-recorder'
import { extractTitlePrefix, triageIssue } from '../../src/core/triage-router'
import { Orchestrator } from '../../src/orchestrator'
import { ClaimEffect, DispatchEffect, EscalateEffect, OrchestratorEvent, SideEffect } from '../../src/types/events'
import { LiveSession, OrchestratorState, RunningEntry } from '../../src/types/internal'
import { WorkspaceManager } from '../../src/workspace/manager'
import { noopExecFile } from '../helpers/noop-exec-file'
import { eventSourcing, loadTrackerSyncConfig } from '@harness-engineering/core'
import { ComplexityScore, EnrichedSpec, SimulationResult } from '@harness-engineering/intelligence'
import { AgentBudgetConfig, ConcernSignal, Err, EscalationConfig, Issue, IssueTrackerClient, Ok, WorkflowConfig } from '@harness-engineering/types'
import { execSync } from 'node:child_process'
import * as fs, fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os, os from 'node:os'
import * as path, path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
