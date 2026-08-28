---
schemaVersion: 1
module: 'packages/graph/tests/entropy'
sourceHash: '76ebc001cfd5795e957300b5198116ccb8307a736db9d6412a12b2e2fc75cedf'
compiledAt: '2026-08-28T01:22:11.722Z'
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
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { GraphStore } from '../../src/store/GraphStore'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
```
