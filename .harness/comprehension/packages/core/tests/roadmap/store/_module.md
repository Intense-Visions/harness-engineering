---
schemaVersion: 1
module: 'packages/core/tests/roadmap/store'
sourceHash: 'b2d0118b500ace5c3a479ab804a9326ce2cd806358f31675e971a58f2a7f239b'
compiledAt: '2026-08-28T01:22:10.984Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'apply-diff.test.ts',
    'archive.test.ts',
    'assembler.test.ts',
    'assignment-history-export.test.ts',
    'factory.behavior.test.ts',
    'factory.test.ts',
    'fixtures.ts',
    'index.test.ts',
    'meta.test.ts',
    'migration.test.ts',
    'monolith-store.test.ts',
    'node-io.test.ts',
    'preamble-round-trip.test.ts',
    'regenerator.test.ts',
    'round-trip.test.ts',
    'shard-store.test.ts',
    'shard.test.ts',
  ]
---

## Summary

**`packages/core/tests/roadmap/store`** is the comprehensive test suite and fixture library for the roadmap storage layer, validating both monolithic and sharded storage modes across 17 test files. It ensures safe mutation semantics, archive lifecycle management, and data integrity throughout the roadmap store abstraction.

Key responsibilities: fixture provisioning (standardized roadmaps/shards in multiple formats), atomic mutation validation (add/patch/remove with all-or-nothing semantics), archive/restore lifecycle with active-read exclusion, storage mode abstraction (monolith vs shard), and round-trip preservation of metadata and assignment history.

## Invariants

- Slug collision detection (F4): applyRoadmapDiff must reject two features that slugify identically before executing any mutations; fail-closed to prevent silent slug→feature index collapse
- Silent milestone-move prevention (F5): features cannot simultaneously change body AND move milestones via patchFeature (which preserves recorded milestone/order); must fail to prevent silent move loss
- Archive exclusion from active reads: readShardDir and regenerate must exclude archive/ subdirectory; shallow listDir behavior (immediate children only) ensures archive appears as directory entry, never exposing nested .md files to active aggregates
- Byte-perfect round-trips: archive→restore cycles must preserve shard bytes exactly; no normalization or mutation between move and restoration
- Idempotency per slug: archive/restore operations silently skip missing slugs rather than error; multiple invocations of same slug list have no side effects
- Fail-closed mutation: applyRoadmapDiff validates all changes before executing any mutations; first error stops processing and leaves store unmodified
- Shallow directory semantics: entire archive strategy depends on fsp.readdir behavior; nested paths like archive/slug.md appear as single 'archive' entry in parent listing, not as .md files

## Interface Contract

```ts
export ASSEMBLER_META
export ASSEMBLER_SHARDS
export EXPECTED_ROADMAP
export META
export META_MD
export META_MD_MISSING_REQUIRED
export META_MD_WITH_HISTORY
export META_WITH_HISTORY
export MIGRATION_META
export MIGRATION_PREAMBLE
export MIGRATION_ROADMAP
export MIGRATION_SHARDS
export MONOLITH_ROADMAP
export MONOLITH_ROADMAP_MD
export OLD_ROADMAP_MD
export SHARD
export SHARD_FEATURE
export SHARD_MD
export SHARD_MD_BAD_ORDER
export SHARD_MD_MISSING_SLUG
export feat
```

## Dependency Slice

```
import { detectRoadmapStorageMode } from '../../../src/roadmap/load-mode'
import { parseAssignmentHistory, parseRoadmap } from '../../../src/roadmap/parse'
import { findUnpreservedLines } from '../../../src/roadmap/preservation'
import { serializeAssignmentHistory, serializeRoadmap } from '../../../src/roadmap/serialize'
import { applyRoadmapDiff } from '../../../src/roadmap/store/apply-diff'
import { archiveShardDir, archiveShards, readArchivedShards, restoreShards } from '../../../src/roadmap/store/archive'
import { assembleRoadmap } from '../../../src/roadmap/store/assembler'
import { archiveDoneShardsForProject, resolveRoadmapStore, resolveRoadmapStoreForFile, roadmapAggregatePath, roadmapSourceExists } from '../../../src/roadmap/store/factory'
import { parseMeta, serializeMeta } from '../../../src/roadmap/store/meta'
import { assertSemanticRoundTrip, roadmapToShards } from '../../../src/roadmap/store/migration'
import { FileIO, MonolithStore } from '../../../src/roadmap/store/monolith-store'
import { createNodeRoadmapIO } from '../../../src/roadmap/store/node-io'
import { regenerate, writeRegeneratedRoadmap } from '../../../src/roadmap/store/regenerator'
import { RoadmapMeta, RoadmapStore, Shard } from '../../../src/roadmap/store/roadmap-store'
import { parseShard, serializeShard } from '../../../src/roadmap/store/shard'
import { ShardIO, ShardStore, readShardDir } from '../../../src/roadmap/store/shard-store'
import { ASSEMBLER_META, ASSEMBLER_SHARDS, EXPECTED_ROADMAP, META, META_MD, META_MD_MISSING_REQUIRED, META_MD_WITH_HISTORY, META_WITH_HISTORY, MIGRATION_META, MIGRATION_ROADMAP, MIGRATION_SHARDS, MONOLITH_ROADMAP, MONOLITH_ROADMAP_MD, OLD_ROADMAP_MD, SHARD, SHARD_MD, SHARD_MD_BAD_ORDER, SHARD_MD_MISSING_SLUG, feat } from './fixtures'
import * as core, { MonolithStore, ShardStore, assembleRoadmap, parseMeta, parseShard, regenerate, serializeMeta, serializeShard, writeRegeneratedRoadmap } from '@harness-engineering/core'
import { AssignmentRecord, Err, FeatureStatus, Ok, Result, Roadmap, RoadmapFeature } from '@harness-engineering/types'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
