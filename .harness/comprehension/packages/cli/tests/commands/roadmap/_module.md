---
schemaVersion: 1
module: 'packages/cli/tests/commands/roadmap'
sourceHash: 'de0af07bed59f2ed4f2e654c4fd51e91f46016dd4522b017b64ee5bf91452f16'
compiledAt: '2026-08-28T01:22:09.653Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'migrate-config.test.ts',
    'migrate-dry-run.test.ts',
    'migrate-idempotent.test.ts',
    'migrate-lock.test.ts',
    'migrate.test.ts',
    'reconcile.test.ts',
    'referenced-issues.test.ts',
    'regen.test.ts',
    'shard-io.test.ts',
    'shard-roundtrip.e2e.test.ts',
    'shard.test.ts',
    'sync-report.test.ts',
    'sync-wiring.test.ts',
    'sync.test.ts',
    'unshard.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRoadmapCommand } from '../../../src/commands/roadmap/index'
import { MigrateExitCode, featuresToRoadmap, reportToExitCode, runRoadmapMigrate } from '../../../src/commands/roadmap/migrate'
import { acquireMigrateLock, isPidAlive, isRefusal } from '../../../src/commands/roadmap/migrate-lock'
import { runRoadmapReconcile } from '../../../src/commands/roadmap/reconcile'
import { runReferencedIssues } from '../../../src/commands/roadmap/referenced-issues'
import { runRoadmapRegen } from '../../../src/commands/roadmap/regen'
import { runRoadmapShard } from '../../../src/commands/roadmap/shard'
import { createNodeShardIO } from '../../../src/commands/roadmap/shard-io'
import { buildSyncOptions, createRoadmapSyncCommand, runRoadmapSync } from '../../../src/commands/roadmap/sync'
import { buildReport, logSyncReport } from '../../../src/commands/roadmap/sync-report'
import { runRoadmapUnshard } from '../../../src/commands/roadmap/unshard'
import { logger } from '../../../src/output/logger'
import { ExitCode } from '../../../src/utils/errors'
import { Err, ExternalTicket, ExternalTicketState, NewFeatureInput, Ok, Result, RoadmapFeature, RoadmapMeta, RoadmapTrackerClient, Shard, ShardStore, SyncResult, TrackedFeature, TrackerSyncAdapter, TrackerSyncConfig, parseRoadmap, regenerate, resolveRoadmapStore, serializeMeta, serializeShard } from '@harness-engineering/core'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
