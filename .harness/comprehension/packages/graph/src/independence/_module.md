---
schemaVersion: 1
module: 'packages/graph/src/independence'
sourceHash: '1395b91d85f6555713ee272b634732c5961e8c985489240520956503f48f5c6d'
compiledAt: '2026-08-28T01:22:11.594Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ConflictPredictor.ts', 'TaskIndependenceAnalyzer.ts', 'index.ts']
---

## Interface Contract

```ts
export ConflictDetail
export ConflictPrediction
export ConflictPredictor
export ConflictSeverity
export IndependenceCheckParams
export IndependenceResult
export OverlapDetail
export PairResult
export TaskDefinition
export TaskIndependenceAnalyzer
```

## Dependency Slice

```
import { GraphComplexityAdapter } from '../entropy/GraphComplexityAdapter.js'
import { GraphCouplingAdapter } from '../entropy/GraphCouplingAdapter.js'
import { ContextQL } from '../query/ContextQL.js'
import { GraphStore } from '../store/GraphStore.js'
import { EdgeType } from '../types.js'
import { IndependenceCheckParams, OverlapDetail, PairResult, TaskIndependenceAnalyzer } from './TaskIndependenceAnalyzer.js'
```
