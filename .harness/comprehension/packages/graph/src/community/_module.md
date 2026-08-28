---
schemaVersion: 1
module: 'packages/graph/src/community'
sourceHash: '44fcf533f12f7a885244e52ebf0223134c65c77fe801b047f9d3b90afd0f00cd'
compiledAt: '2026-08-28T01:22:11.580Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['CommunityDetector.ts', 'LouvainDetector.ts', 'detectCommunities.ts']
---

## Interface Contract

```ts
export LouvainDetector
export buildCommunityInput
export detectCommunities
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { CommunityDetectionResult, CommunityDetector, CommunityDetectorOptions, CommunityGraphInput } from './CommunityDetector.js'
import { LouvainDetector } from './LouvainDetector.js'
```
