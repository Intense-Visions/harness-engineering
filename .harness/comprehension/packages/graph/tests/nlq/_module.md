---
schemaVersion: 1
module: 'packages/graph/tests/nlq'
sourceHash: '77ed76b888ff2f723cad421dedd762625539b76d7aa6d953ecb667536a8bd88f'
compiledAt: '2026-08-28T01:22:11.775Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'EntityExtractor.test.ts',
    'EntityResolver.test.ts',
    'IntentClassifier.test.ts',
    'ResponseFormatter.test.ts',
    'askGraph.test.ts',
    'staleness.test.ts',
    'types.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntityExtractor } from '../../src/nlq/EntityExtractor.js'
import { EntityResolver } from '../../src/nlq/EntityResolver.js'
import { IntentClassifier } from '../../src/nlq/IntentClassifier.js'
import { ResponseFormatter } from '../../src/nlq/ResponseFormatter.js'
import { askGraph } from '../../src/nlq/index.js'
import { AskGraphResult, ClassificationResult, Intent, ResolvedEntity, StalenessQueryResult } from '../../src/nlq/types.js'
import from '../../src/query/ContextQL.js'
import { FusionLayer, FusionResult } from '../../src/search/FusionLayer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../../src/types.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
```
