---
schemaVersion: 1
module: 'packages/graph/src/entropy'
sourceHash: 'a1e6ebb3e0eabdac23bc6015c1e291ef417c6adc0a36162c3b02494300e2471c'
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
