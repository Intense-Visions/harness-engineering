---
schemaVersion: 1
module: 'packages/intelligence/tests'
sourceHash: '41078c91923515d44d18df7defc5f54ffefa2a5ddbdefb7f5b6b2851abbca0c2'
compiledAt: '2026-08-28T01:22:11.869Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['adapter.test.ts', 'pipeline.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { toRawWorkItem } from '../src/adapter.js'
import { AnalysisProvider } from '../src/analysis-provider/interface.js'
import { IntelligencePipeline } from '../src/pipeline.js'
import { GraphStore } from '@harness-engineering/graph'
import { EscalationConfig, Issue } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
