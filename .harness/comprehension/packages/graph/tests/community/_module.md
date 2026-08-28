---
schemaVersion: 1
module: 'packages/graph/tests/community'
sourceHash: '91e37803233744b5563972dc687b7797dc968354357024c8f576c12fc39f5a35'
compiledAt: '2026-08-28T01:22:11.691Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['LouvainDetector.test.ts', 'detectCommunities.test.ts']
---

## Summary

The `packages/graph/tests/community` module validates graph community detection via the Louvain clustering algorithm and its integration with GraphStore. LouvainDetector partitions nodes into cohesive communities based on edge density, handling separable clusters, isolated nodes, edge weights, and determinism. The integration layer (detectCommunities + buildCommunityInput) wires the algorithm into GraphStore, supporting optional persistence of community IDs to node metadata, confidence-based edge weighting, and schema roundtripping.

## Invariants

- Determinism: identical input → identical assignments; fixed seed produces reproducible results with community 0 = first-seen node
- Full coverage: every input node receives exactly one community ID in range [0, communityCount)
- Separable clusters: weakly-bridged cliques partition into ≥2 communities; fully connected clique yields 1 community
- Edge robustness: edges referencing unknown nodeIds are silently dropped, not errors
- Modularity positivity: non-trivial graphs report modularity > 0
- Edge weight semantics: weight influences affinity (high = stronger cohesion); absent weight defaults to 1
- Persistence contract: persist:true writes community to node.community; persist:false returns result without mutation
- Isolated/empty handling: N isolated nodes → N communities; empty graph → 0 communities and 0 assignments
- Pluggability: detector.name must be exactly 'louvain' for discovery/routing
- Confidence weighting: edge confidence values are read as weights in algorithm input

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
