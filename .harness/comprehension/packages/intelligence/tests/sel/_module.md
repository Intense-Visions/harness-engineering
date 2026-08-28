---
schemaVersion: 1
module: 'packages/intelligence/tests/sel'
sourceHash: '9abd19464d4ea2894608a909f65e4f5c14f28b22af277a40d556ee509283127c'
compiledAt: '2026-08-28T01:22:11.916Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['enricher.test.ts', 'graph-validator.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AnalysisProvider, AnalysisResponse } from '../../src/analysis-provider/interface.js'
import { enrich } from '../../src/sel/enricher.js'
import { GraphValidator } from '../../src/sel/graph-validator.js'
import { SELResponse } from '../../src/sel/prompts.js'
import { AffectedSystem, RawWorkItem } from '../../src/types.js'
import { GraphEdge, GraphNode, GraphStore } from '@harness-engineering/graph'
import { describe, expect, it, vi } from 'vitest'
```
