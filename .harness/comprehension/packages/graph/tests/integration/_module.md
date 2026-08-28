---
schemaVersion: 1
module: 'packages/graph/tests/integration'
sourceHash: '5a005e661ace3cbe05da7629f727f3535e08a9fb7f35abc48a9b2189894f4d63'
compiledAt: '2026-08-28T01:22:11.735Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'community-detection.test.ts',
    'knowledge-pipeline-domain-config.test.ts',
    'knowledge-pipeline-materialization.test.ts',
    'knowledge-pipeline.test.ts',
    'scan-and-query.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { detectCommunities } from '../../src/community/detectCommunities.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { DiagramParser } from '../../src/ingest/DiagramParser.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js'
import { KnowledgeStagingAggregator } from '../../src/ingest/KnowledgeStagingAggregator.js'
import { KnowledgeSnapshot, StructuralDriftDetector } from '../../src/ingest/StructuralDriftDetector.js'
import { TopologicalLinker } from '../../src/ingest/TopologicalLinker.js'
import { ContextQL } from '../../src/query/ContextQL.js'
import { FusionLayer } from '../../src/search/FusionLayer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
