---
schemaVersion: 1
module: 'packages/graph/src/blast-radius'
sourceHash: '1c056239d81aab37eda502a38d07c9ebf73dbf105a5170bca4fb02f76d0e5855'
compiledAt: '2026-08-28T01:22:11.584Z'
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
import { classifyNodeCategory } from '../query/groupImpact.js'
import { GraphStore } from '../store/GraphStore.js'
import { GraphEdge, GraphNode } from '../types.js'
import { CompositeProbabilityStrategy } from './CompositeProbabilityStrategy.js'
import { CascadeLayer, CascadeNode, CascadeResult, CascadeSimulationOptions, ProbabilityStrategy } from './types.js'
```
