---
schemaVersion: 1
module: 'packages/core/src/roadmap/store'
sourceHash: 'f977597f4d29be0f994a71473c0a8db1b92805254ff495b66d10f217b701758c'
compiledAt: '2026-08-28T01:22:10.564Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
