---
schemaVersion: 1
module: 'packages/core/src/roadmap/store'
sourceHash: '07a0c4fffb01216fec366608d5bc1bbcb48f96469e0305c2c042c3d3cd8454c2'
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
export RegenerateOptions
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
export shardMetaPath
export slugifyFeatureName
export writeRegeneratedRoadmap
```

## Dependency Slice

```
import { UnreadableAssignmentHistoryError, extractAssignmentHistorySection, stripAssignmentHistorySection } from '../assignment-history'
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
import { ARCHIVE_SUBDIR, ShardIO, ShardStore, readShardDir, shardMetaPath } from './shard-store'
import { quoteYamlScalar } from './yaml-scalar'
import { AssignmentRecord, Err, Ok, Result, Roadmap, RoadmapFeature, RoadmapFrontmatter, RoadmapMilestone } from '@harness-engineering/types'
import matter from 'gray-matter'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { parseYaml } from 'yaml'
```
