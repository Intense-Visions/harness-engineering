---
schemaVersion: 1
module: 'packages/graph/src/community'
sourceHash: '44fcf533f12f7a885244e52ebf0223134c65c77fe801b047f9d3b90afd0f00cd'
compiledAt: '2026-08-28T01:22:11.580Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['CommunityDetector.ts', 'LouvainDetector.ts', 'detectCommunities.ts']
---

## Summary

This module partitions knowledge graphs into densely-connected subsystems using a pluggable, algorithm-agnostic interface backed by Louvain modularity maximization. Louvain identifies communities through two-phase iteration (greedy node moves to maximize modularity, then community aggregation into super-nodes) repeated across hierarchy levels until convergence. The interface accepts minimal input (node IDs + weighted edges) to decouple from GraphStore and enable testing; output assigns each node a community label and reports final modularity. All operations are deterministic given a seed, undirected, and tunable via resolution (community size preference) and maxPasses (iteration depth).

## Invariants

- Community IDs must compact to dense [0, communityCount) range before propagating to original nodes; sparse IDs break level-to-node mapping
- Each undirected edge appears in both adjacency lists but is consumed only once per aggregation phase (u<neighbor direction only) to prevent double-counting
- Self-loops stored separately and counted 2× toward node degree; not included in adjacency lists
- Node processing order is deterministic: level-0 order fixed by seed, aggregated levels use natural index order
- Convergence stops when modularity improves <1e-9, collapses to ≤1 community, or hits maxPasses; any early exit yields stable labels
- originalToLevelNode array chains original-node indices through all hierarchy levels; original-to-community assignment must follow this mapping
- Final modularity computed over level0 (original graph), not the contracted final level
- Dangling edges (undefined source/target) and zero/negative weights silently dropped during construction
- Modularity deltas scale by resolution × comTot[c] × (nodeDeg / 2m); omitting resolution defaults to 1.0 (classic modularity)

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
