---
schemaVersion: 1
module: 'packages/graph/src/entropy'
sourceHash: '0a92f83581c2094b0e01520ee00a72587a5e7ccbb1ac39fb79ec7efb1eea08a1'
compiledAt: '2026-08-28T01:22:11.594Z'
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
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { GraphComplexityAdapter, GraphComplexityResult } from './GraphComplexityAdapter.js'
import { GraphCouplingAdapter, GraphCouplingResult } from './GraphCouplingAdapter.js'
```
