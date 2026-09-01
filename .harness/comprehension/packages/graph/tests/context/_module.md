---
schemaVersion: 1
module: 'packages/graph/tests/context'
sourceHash: '32ff25d93c2c8abb11d99e4ad24ae05ad87015bcb4615727d1d9a64b3d51d87c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['Assembler.test.ts', 'StabilityLayout.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AssembledContext, Assembler, GraphBudget, GraphCoverageReport, GraphFilterResult } from '../../src/context/Assembler.js'
import { CacheEfficiencyMeter, StabilityTier, auditLayout, orderByStability, stabilityTierForNode, toLayoutSections } from '../../src/context/StabilityLayout.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { GraphNode, NodeType } from '../../src/types.js'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
```
