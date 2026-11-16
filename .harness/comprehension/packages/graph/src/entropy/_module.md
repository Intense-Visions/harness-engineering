---
schemaVersion: 1
module: 'packages/graph/src/entropy'
sourceHash: '116a9edb3794d7556924b72c774747923099b692b7c73a52fd51862c69d9e641'
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
