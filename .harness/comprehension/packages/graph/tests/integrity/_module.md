---
schemaVersion: 1
module: 'packages/graph/tests/integrity'
sourceHash: 'f0a2efa8a390b1ec77d92fee2071adc8081ec0261fb91c53d4569824d3452c1a'
compiledAt: '2026-08-28T01:22:11.748Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['GraphIntegrityChecker.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { SyncMetadata } from '../../src/ingest/connectors/ConnectorInterface.js'
import { checkConnectorSync, checkExtractedNodes, checkGraphIntegrity } from '../../src/integrity/GraphIntegrityChecker.js'
import { GraphNode } from '../../src/types.js'
import { describe, expect, it } from 'vitest'
```
