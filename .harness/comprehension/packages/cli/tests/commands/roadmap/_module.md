---
schemaVersion: 1
module: 'packages/cli/tests/commands/roadmap'
sourceHash: 'de0af07bed59f2ed4f2e654c4fd51e91f46016dd4522b017b64ee5bf91452f16'
compiledAt: '2026-08-28T01:22:09.653Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/cli/tests/commands/roadmap` test suite (15 test files, ~3,100 lines) validates the roadmap CLI subsystem, which manages product roadmaps stored in `docs/roadmap.md` or sharded in `docs/roadmap.d/`, syncing them with external trackers (GitHub issues) and supporting workflows like migration, regeneration, and locking for concurrent access. Key functional areas: **Migrate** — transition roadmaps between storage modes (file-backed ↔ file-less), preserving config; **Sync** — bidirectional reconciliation with GitHub tracker, apply updates only when requested; **Shard/Unshard** — split monolithic roadmap.md into roadmap.d/\*.md shards with collision detection; **Regen** — rebuild aggregate roadmap from shards without tracker access; **Reconcile & Referenced-Issues** — consistency checks; **Migrate-Lock** — prevent concurrent migrations, detect stale PIDs. Test patterns use mock RoadmapTrackerClient to isolate CLI logic, temporary directories for filesystem, console.log spying for output verification, and cross-platform path normalization to `/`.

## Invariants

- Dry-run isolation — --dry-run (or no --apply flag) must never invoke tracker writes; read operations only; reported mode must be "dry-run", not "applied"
- Backup atomicity — before modifying harness.config.json or archiving roadmap.md, write a byte-identical backup (.pre-migration or .archived); back up BEFORE any changes are made
- Config field preservation — non-roadmap fields in harness.config.json must remain unchanged during migration; only add/modify the roadmap.\* subtree
- Idempotent re-runs — running migrate/sync/shard twice must be safe: second run detects completed state and becomes a no-op or reports already-migrated status; never re-create/re-process
- Tracker abstraction contract — all tracker I/O goes through a single RoadmapTrackerClient interface; tests use mocks to verify exactly which methods are called and in what order (especially: no unexpected writes during reads)
- Zero writes by default — harness roadmap sync without --apply performs zero adapter writes; safe for nightly CI jobs; only --apply or explicit commands permit mutations
- Cross-platform path normalization — shard I/O paths use / delimiters on all OSes (Windows, macOS, Linux); injected-io mocks must match normalized paths; comparison is path.posix.join(), not path.join()
- Shard slug uniqueness — slug collisions (e.g., "Fix login" and "Fix: login!" both → fix-login) must be detected and preserved in output; collision detection is load-bearing for roundtrip correctness
- Migration plan accuracy — dry-run and pre-flight plans must accurately report Would-Create, Would-Update, and Unchanged counts; plan summary must appear on stdout before any mutations
- Lock lifecycle — migrate lock (PID-based) must be acquired before mutations and released on success/error; stale PIDs (dead processes) must be detected and forced-released; enables concurrent access gates

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
