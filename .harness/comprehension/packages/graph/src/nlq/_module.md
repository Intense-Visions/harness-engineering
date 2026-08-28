---
schemaVersion: 1
module: 'packages/graph/src/nlq'
sourceHash: 'e2a75d194984d60656a8446508502db94784e8886b6bc1b7b25e6c2aea315008'
compiledAt: '2026-08-28T01:22:11.656Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'EntityExtractor.ts',
    'EntityResolver.ts',
    'IntentClassifier.ts',
    'ResponseFormatter.ts',
    'index.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export AskGraphResult
export ClassificationResult
export EntityExtractor
export EntityResolver
export INTENTS
export Intent
export IntentClassifier
export ResolvedEntity
export ResponseFormatter
export StaleNodeSummary
export StalenessQueryResult
export askGraph
```

## Dependency Slice

```
import { CascadeSimulator } from '../blast-radius/index.js'
import { GraphAnomalyAdapter } from '../entropy/GraphAnomalyAdapter.js'
import { ContextQL } from '../query/ContextQL.js'
import { groupNodesByImpact } from '../query/groupImpact.js'
import { FusionLayer } from '../search/FusionLayer.js'
import { GraphStore } from '../store/GraphStore.js'
import { GraphNode, NodeType } from '../types.js'
import { EntityExtractor } from './EntityExtractor.js'
import { EntityResolver } from './EntityResolver.js'
import { IntentClassifier } from './IntentClassifier.js'
import { ResponseFormatter } from './ResponseFormatter.js'
import { AskGraphResult, ClassificationResult, INTENTS, Intent, ResolvedEntity, StaleNodeSummary, StalenessQueryResult } from './types.js'
```
