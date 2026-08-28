---
schemaVersion: 1
module: 'packages/cli/src/commands/roadmap'
sourceHash: '3d1a7e1f54afcff89ad9cab4a0f497809c89cd3fa2790f0475ded502310395d3'
compiledAt: '2026-08-28T01:22:08.931Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'index.ts',
    'install-hook.test.ts',
    'install-hook.ts',
    'migrate-lock.ts',
    'migrate.ts',
    'reconcile.ts',
    'referenced-issues.ts',
    'regen.ts',
    'shard-io.ts',
    'shard.ts',
    'sync-deps.ts',
    'sync-report.ts',
    'sync-verdict.ts',
    'sync.ts',
    'triage-approve.test.ts',
    'triage-approve.ts',
    'triage-feature.ts',
    'triage-pool.test.ts',
    'triage-pool.ts',
    'triage-provider.test.ts',
    'triage-provider.ts',
    'triage.test.ts',
    'triage.ts',
    'unshard.ts',
  ]
---

## Summary

The `roadmap` command module is a CLI facade aggregating nine subcommands for managing sharded project roadmaps (stored as `docs/roadmap.d/*.md` with a generated aggregate `docs/roadmap.md`). Core responsibilities: hook installation (idempotent pre-commit auto-regen with adopter-code preservation), sharding/unsharding, sync & reconciliation with external trackers (GitHub, Linear, etc.), triage & approval workflows (brainstorm/intelligence evaluation), migration with locking, and metadata management. Integrates deeply with core roadmap store, sync adapters, brainstorm/triage intelligence, and orchestrator ranking.

## Invariants

- Idempotent hook merge — managed block (HOOK_BLOCK_BEGIN/END delimiters) can be re-merged with identical or new regen commands without clobbering adopter steps; adopter content must precede managed block
- Guarded regeneration — hook fires only when a shard file (docs/roadmap.d/\*) is staged, verified by grep -qE '^docs/roadmap\.d/' on git index; non-shard commits skip regen
- Fail-closed hook — if regen fails, hook exits 1 and blocks commit; aggregate is re-staged after successful regen
- Graceful sharding degradation — hook installation silently skips for non-sharded projects unless --force passed (pre-provision mode)
- Mechanism auto-detection — installer detects husky (.husky/pre-commit) before raw .git/hooks/pre-commit; respects explicit --mechanism override
- Semantic round-trip validation — sync and regen operations validate parsed-then-serialized roadmap matches original to prevent lossy transformations
- External ID fidelity — tracker sync requires stable externalId mapping; open issues without shards remain invisible; reconciliation uses External-ID drift detection
- Single canonical aggregate — docs/roadmap.md is source of truth for display/export; shards are derivable, aggregate is not (single enumeration+hash is load-bearing)

## Interface Contract

```ts
export createRoadmapCommand
```

## Dependency Slice

```
import { resolveConfig } from '../../config/loader'
import { loadGraphStore } from '../../mcp/utils/graph-loader'
import { logger } from '../../output/logger'
import { CLIError, ExitCode } from '../../utils/errors'
import { DEFAULT_REGEN_COMMAND, HOOK_BLOCK_BEGIN, HOOK_BLOCK_END, buildRegenBlock, createRoadmapInstallHookCommand, mergeHookContent, runRoadmapInstallHook } from './install-hook'
import { createRoadmapMigrateCommand } from './migrate'
import { acquireMigrateLock, isRefusal } from './migrate-lock'
import { createRoadmapReconcileCommand } from './reconcile'
import { createRoadmapReferencedIssuesCommand } from './referenced-issues'
import { createRoadmapRegenCommand } from './regen'
import { createRoadmapShardCommand } from './shard'
import { NodeShardIO, createNodeShardIO } from './shard-io'
import { createRoadmapSyncCommand } from './sync'
import { resolveAdapter, resolveConfig } from './sync-deps'
import { RoadmapSyncReport, buildReport, logSyncReport } from './sync-report'
import { verdictFor } from './sync-verdict'
import { buildPrecedentLookup, buildShapeHistory, createRoadmapTriageCommand, featureToIssue, isActionable, renderBrainstormHuman, renderBrainstormJson, renderHuman, renderJson, runBrainstormReport, runTriageReport } from './triage'
import { ReadyCandidate, buildApprovalPlan, deriveReadyCandidates, resolveEffectiveStage } from './triage-approve.js'
import { BrainstormReportRow, featureToIssue, isActionable } from './triage-feature.js'
import { PoolSnapshotStore, resolvePreferredLocalModel } from './triage-pool.js'
import { TriageProviderConfig, resolveTriageProvider } from './triage-provider.js'
import { BrainstormReportRow, runApproveCommand } from './triage.js'
import { createRoadmapUnshardCommand } from './unshard'
import { Err, ExternalSyncOptions, ExternalTicketState, GitHubIssuesSyncAdapter, Ok, Result, Roadmap, RoadmapFeature, RoadmapMeta, RoadmapStore, RoadmapTrackerClient, Shard, ShardIO, SuppressedInbound, SyncResult, TrackedFeature, TrackerSyncAdapter, TrackerSyncConfig, assertRegeneratedRoundTrip, assertSemanticRoundTrip, buildExternalId, createTrackerClient, eventSourcing, fullSync, loadProjectRoadmapMode, loadTrackerClientConfigFromProject, loadTrackerSyncConfig, migrate, parseReferencedIssues, parseRoadmap, reconcileDoneFromClosedIssues, regenerate, resolveRoadmapStore, resolveRoadmapStoreForFile, roadmapSourceExists, roadmapToShards, serializeMeta, serializeRoadmap, serializeShard, writeRegeneratedRoadmap } from '@harness-engineering/core'
import { GraphNode, GraphStore } from '@harness-engineering/graph'
import { AnalysisProvider, AnthropicAnalysisProvider, ForkGenerator, OpenAICompatibleAnalysisProvider, PrecedentLookup, RatchetOutcome, RatchetStage, StagedGoNoGoCandidate, V1_MAX_STAGE, dispatchableShapeKey, resolveGoNoGoStaged, resolveStage, shapeKey } from '@harness-engineering/intelligence'
import { BrainstormWiringDeps, PoolState, PoolStateStore, RankProfile, RankableCandidate, TriageMarkItem, TriageVerdict, WiredBrainstormResult, artifactPresenceFromIssue, detectScopeTier, markApprovedForDispatch, poolStateToCandidates, precedentLookupFromStored, rankTriageCandidates, runBrainstormForIssue, triageIssue } from '@harness-engineering/orchestrator'
import { Issue, Roadmap, RoadmapFeature, ScopeTier } from '@harness-engineering/types'
import chalk from 'chalk'
import { Command } from 'commander'
import from 'dotenv'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
