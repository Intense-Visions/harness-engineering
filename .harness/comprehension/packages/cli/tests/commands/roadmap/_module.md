---
schemaVersion: 1
module: 'packages/cli/tests/commands/roadmap'
sourceHash: '5e9927551af9e10d8d828561dde3fcbec94d98e7c12fbab97d187ffa58158309'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'install-hook-cov544.test.ts',
    'migrate-config.test.ts',
    'migrate-cov544.test.ts',
    'migrate-dry-run.test.ts',
    'migrate-idempotent.test.ts',
    'migrate-lock.test.ts',
    'migrate.test.ts',
    'reconcile-cov544.test.ts',
    'reconcile.test.ts',
    'referenced-issues.test.ts',
    'regen.test.ts',
    'shard-io.test.ts',
    'shard-roundtrip.e2e.test.ts',
    'shard.test.ts',
    'sync-deps-pnyon.test.ts',
    'sync-report.test.ts',
    'sync-wiring.test.ts',
    'sync.test.ts',
    'triage-cov544.test.ts',
    'unshard.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRoadmapCommand } from '../../../src/commands/roadmap/index'
import { DEFAULT_REGEN_COMMAND, HOOK_BLOCK_BEGIN, HOOK_BLOCK_END, buildRegenBlock, mergeHookContent, runInstallHookAction, runRoadmapInstallHook } from '../../../src/commands/roadmap/install-hook'
import { MigrateExitCode, createRoadmapMigrateCommand, featuresToRoadmap, reportToExitCode, runReverseMigrate, runRoadmapMigrate } from '../../../src/commands/roadmap/migrate'
import { acquireMigrateLock, isPidAlive, isRefusal } from '../../../src/commands/roadmap/migrate-lock'
import { createRoadmapReconcileCommand, runRoadmapReconcile } from '../../../src/commands/roadmap/reconcile'
import { runReferencedIssues } from '../../../src/commands/roadmap/referenced-issues'
import { ALLOW_UNREADABLE_HISTORY_ENV, runRoadmapRegen } from '../../../src/commands/roadmap/regen'
import { runRoadmapShard } from '../../../src/commands/roadmap/shard'
import { createNodeShardIO } from '../../../src/commands/roadmap/shard-io'
import { buildSyncOptions, createRoadmapSyncCommand, runRoadmapSync } from '../../../src/commands/roadmap/sync'
import { resolveAdapter, resolveConfig } from '../../../src/commands/roadmap/sync-deps'
import { buildReport, logSyncReport } from '../../../src/commands/roadmap/sync-report'
import { BrainstormReportRow, TriageReportRow, buildPrecedentLookup, buildShapeHistory, createRoadmapTriageCommand, isPlausibleForModel, renderBrainstormHuman, renderBrainstormJson, renderHuman, renderJson, runApproveCommand, runBrainstormReport, runTriageReport, selectActionableFeatures } from '../../../src/commands/roadmap/triage'
import { runRoadmapUnshard } from '../../../src/commands/roadmap/unshard'
import { logger } from '../../../src/output/logger'
import { ExitCode } from '../../../src/utils/errors'
import { Err, ExternalTicket, ExternalTicketState, GitHubIssuesSyncAdapter, NewFeatureInput, Ok, PnyonSyncAdapter, Result, RoadmapFeature, RoadmapMeta, RoadmapTrackerClient, Shard, ShardStore, SyncResult, TrackedFeature, TrackerSyncAdapter, TrackerSyncConfig, parseRoadmap, regenerate, resolveRoadmapStore, serializeMeta, serializeShard } from '@harness-engineering/core'
import { TriageVerdict } from '@harness-engineering/orchestrator'
import { Roadmap, RoadmapFeature } from '@harness-engineering/types'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
