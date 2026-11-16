---
schemaVersion: 1
module: 'packages/graph/src/entropy'
sourceHash: 'cc9efc4d9513f50c14f1ccc3c196efc35d3d471549d5c66d12ba3a7263f9060b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'GraphAnomalyAdapter.ts',
    'GraphComplexityAdapter.ts',
    'GraphCouplingAdapter.ts',
    'GraphEntropyAdapter.ts',
  ]
---

## Interface Contract

```ts
export GraphAnomalyAdapter
export GraphComplexityAdapter
export GraphCouplingAdapter
export GraphEntropyAdapter
export countFileCommits
export hasIngestedCommits
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { GraphComplexityAdapter, GraphComplexityResult } from './GraphComplexityAdapter.js'
import { GraphCouplingAdapter, GraphCouplingResult } from './GraphCouplingAdapter.js'
```
