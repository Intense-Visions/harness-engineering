---
schemaVersion: 1
module: 'packages/graph/tests/entropy'
sourceHash: '69708faa6c0c96beccb32b65ce1ff4cc22c560190b02607af4f6c7326b38d58e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'GraphAnomalyAdapter.test.ts',
    'GraphComplexityAdapter.test.ts',
    'GraphCouplingAdapter.test.ts',
    'GraphEntropyAdapter.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GraphAnomalyAdapter } from '../../src/entropy/GraphAnomalyAdapter.js'
import { GraphComplexityAdapter } from '../../src/entropy/GraphComplexityAdapter'
import { GraphCouplingAdapter, GraphCouplingFileData, GraphCouplingResult } from '../../src/entropy/GraphCouplingAdapter.js'
import { GraphDeadCodeData, GraphDriftData, GraphEntropyAdapter, GraphSnapshotSummary } from '../../src/entropy/GraphEntropyAdapter.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { GitIngestor, GitRunner } from '../../src/ingest/GitIngestor'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { GraphStore } from '../../src/store/GraphStore'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
```
