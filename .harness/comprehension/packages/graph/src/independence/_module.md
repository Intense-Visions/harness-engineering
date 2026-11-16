---
schemaVersion: 1
module: 'packages/graph/src/independence'
sourceHash: 'b214555d918e5b02e7c19dc5f2ddb79ae080b7732609d4e19ecca5a38a09f3f8'
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
