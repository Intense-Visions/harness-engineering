---
schemaVersion: 1
module: 'packages/graph/tests/independence'
sourceHash: 'eea922255f9a971fa1596d536d2bb362040663be79381bfcb8c85411ea79ec46'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ConflictPredictor.test.ts', 'TaskIndependenceAnalyzer.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ConflictPredictor } from '../../src/independence/ConflictPredictor.js'
import { TaskIndependenceAnalyzer } from '../../src/independence/TaskIndependenceAnalyzer.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { describe, expect, it } from 'vitest'
```
