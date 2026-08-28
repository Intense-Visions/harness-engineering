---
schemaVersion: 1
module: 'packages/graph/tests/community'
sourceHash: '91e37803233744b5563972dc687b7797dc968354357024c8f576c12fc39f5a35'
compiledAt: '2026-08-28T01:22:11.691Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['LouvainDetector.test.ts', 'detectCommunities.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CommunityGraphInput } from '../../src/community/CommunityDetector.js'
import { LouvainDetector } from '../../src/community/LouvainDetector.js'
import { buildCommunityInput, detectCommunities } from '../../src/community/detectCommunities.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../../src/types.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
