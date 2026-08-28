---
schemaVersion: 1
module: 'packages/graph/tests/context'
sourceHash: 'a3d9eda77c6109c3d4b1005e361a9633ca4cd95ec863c8c7818c873a7829674c'
compiledAt: '2026-08-28T01:22:11.701Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['Assembler.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AssembledContext, Assembler, GraphBudget, GraphCoverageReport, GraphFilterResult } from '../../src/context/Assembler.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
```
