---
schemaVersion: 1
module: 'packages/graph/src/blast-radius'
sourceHash: '912f85cf19a19d66dfd1266cee3a63cfbd978ccea03350621b811c35aa56800e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['CascadeSimulator.ts', 'CompositeProbabilityStrategy.ts', 'index.ts', 'types.ts']
---

## Interface Contract

```ts
export CascadeLayer
export CascadeNode
export CascadeResult
export CascadeSimulationOptions
export CascadeSimulator
export CompositeProbabilityStrategy
export ProbabilityStrategy
```

## Dependency Slice

```
import { countFileCommits, hasIngestedCommits } from '../entropy/GraphComplexityAdapter.js'
import { classifyNodeCategory } from '../query/groupImpact.js'
import { GraphStore } from '../store/GraphStore.js'
import { GraphEdge, GraphNode } from '../types.js'
import { CompositeProbabilityStrategy } from './CompositeProbabilityStrategy.js'
import { CascadeLayer, CascadeNode, CascadeResult, CascadeSimulationOptions, ProbabilityStrategy } from './types.js'
```
