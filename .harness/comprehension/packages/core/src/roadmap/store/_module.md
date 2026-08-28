---
schemaVersion: 1
module: 'packages/core/src/roadmap/store'
sourceHash: 'f977597f4d29be0f994a71473c0a8db1b92805254ff495b66d10f217b701758c'
compiledAt: '2026-08-28T01:22:10.564Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'apply-diff.ts',
    'archive.ts',
    'assembler.ts',
    'factory.ts',
    'index.ts',
    'meta.ts',
    'migration.ts',
    'monolith-store.ts',
    'node-io.ts',
    'regenerator.ts',
    'roadmap-store.ts',
    'shard-store.ts',
    'shard.ts',
    'yaml-scalar.ts',
  ]
---

## Summary

**`packages/core/src/roadmap/store`** is the persistence layer for the roadmap system, abstracting two storage modes (monolith single-file vs. sharded one-file-per-row). It coordinates reading, writing, diffing, and archiving features while maintaining data integrity. Core responsibilities include: (1) `applyRoadmapDiff` diffs two Roadmap objects and issues minimal store operations (add/patch/remove per slug), working uniformly across both storage modes; (2) archive/restore moves done rows to/from `archive/` subdirectories byte-for-byte while keeping them invisible to active queries; (3) `assembleRoadmap` groups shards by milestone and sorts deterministically; (4) dual-mode dispatch via abstract `RoadmapStore` interface picks between `ShardStore` and `MonolithStore` transparently. The module serves as the seam between whole-Roadmap producers (sync, groom, promote-cascade) and underlying persistence, enabling conflict-free writes in sharded mode.

## Invariants

- Feature identity is immutable by slug — slug collisions are rejected with Err to prevent silent data loss via duplicate-name collapse
- Milestone moves require remove + add, not patch — patching preserves shard milestone/order, so cross-milestone moves must be explicit to avoid silent motion drops
- Archive motion is byte-preserving and reversible — shards move to archive/ with full fidelity; factory regenerates aggregate after moves (invariant R: this module never touches aggregate)
- Active reads exclude archive subdirectory — readShardDir skips archive/, so archived shards never re-appear in load()/active queries
- Archive/restore operations are idempotent per slug — missing sources are skipped not failed; partial moves resume safely
- Write-before-delete safety — archive/restore writes destination before deleting source, guaranteeing no data loss on IO failure
- File-slug matching — each shard filename must match its frontmatter slug; mismatches detected and rejected during read
- Deterministic feature ordering — within milestone: order ascending, status-rank descending, slug ascending; empty milestones retain empty feature lists
- Frontmatter + assignment history persist in both modes — monolith rewrites whole file; sharded stores in \_meta.md only; audit log kept in both

## Interface Contract

```ts
export ARCHIVE_SUBDIR
export AddFeatureInput
export FeatureMutation
export FileIO
export MonolithStore
export MonolithStoreOptions
export ResolveRoadmapStoreForFileOptions
export ResolveRoadmapStoreOptions
export RoadmapMeta
export RoadmapStore
export Shard
export ShardArchiveResult
export ShardIO
export ShardStore
export applyRoadmapDiff
export archiveDoneShardsForProject
export archiveShardDir
export archiveShards
export assembleRoadmap
export assertRegeneratedRoundTrip
export assertSemanticRoundTrip
export createNodeRoadmapIO
export parseMeta
export parseShard
export readArchivedShards
export readShardDir
export regenerate
export resolveRoadmapStore
export resolveRoadmapStoreForFile
export restoreShards
export roadmapAggregatePath
export roadmapSourceExists
export roadmapToShards
export serializeMeta
export serializeShard
export slugifyFeatureName
export writeRegeneratedRoadmap
```

## Dependency Slice

```
import { parseFeatureHeading } from '../heading'
import { detectRoadmapStorageMode } from '../load-mode'
import { parseAssignmentHistory, parseFeatureBlock, parseRoadmap } from '../parse'
import { findUnpreservedLines } from '../preservation'
import { serializeAssignmentHistory, serializeFeature, serializeRoadmap } from '../serialize'
import { STATUS_RANK } from '../status-rank'
import { ShardArchiveResult, archiveShards } from './archive'
import { assembleRoadmap } from './assembler'
import { parseMeta, serializeMeta } from './meta'
import { FileIO, MonolithStore, slugifyFeatureName } from './monolith-store'
import { createNodeRoadmapIO } from './node-io'
import { writeRegeneratedRoadmap } from './regenerator'
import { AddFeatureInput, FeatureMutation, RoadmapMeta, RoadmapStore, Shard } from './roadmap-store'
import { parseShard, serializeShard } from './shard'
import { ARCHIVE_SUBDIR, ShardIO, ShardStore, readShardDir } from './shard-store'
import { quoteYamlScalar } from './yaml-scalar'
import { AssignmentRecord, Err, Ok, Result, Roadmap, RoadmapFeature, RoadmapFrontmatter, RoadmapMilestone } from '@harness-engineering/types'
import matter from 'gray-matter'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parseYaml } from 'yaml'
```
