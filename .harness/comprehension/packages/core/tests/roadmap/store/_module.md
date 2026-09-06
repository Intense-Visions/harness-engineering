---
schemaVersion: 1
module: 'packages/core/tests/roadmap/store'
sourceHash: 'db85fa26db7d31ee00cb776b641916ca58081bfa84f8ebe2dfc0a0f383bd92b9'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
