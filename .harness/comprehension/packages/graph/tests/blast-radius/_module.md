---
schemaVersion: 1
module: 'packages/graph/tests/blast-radius'
sourceHash: '41ef3e1c150fbea48956d3a4cf2bf7d9ea75e5a30a1837aac1efd404ec55b31d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['CascadeSimulator.test.ts', 'CompositeProbabilityStrategy.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CascadeSimulator } from '../../src/blast-radius/CascadeSimulator'
import { CompositeProbabilityStrategy } from '../../src/blast-radius/CompositeProbabilityStrategy'
import { GraphStore } from '../../src/store/GraphStore'
import { GraphEdge, GraphNode } from '../../src/types'
import { describe, expect, it } from 'vitest'
```
