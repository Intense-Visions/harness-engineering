---
schemaVersion: 1
module: 'packages/graph/tests/blast-radius'
sourceHash: 'a4dfbcc2de7a7761bf029d0003f29d051c0e5f28fdec3bcc44dfa503363aed8a'
compiledAt: '2026-08-28T01:22:11.682Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['CascadeSimulator.test.ts', 'CompositeProbabilityStrategy.test.ts']
---

## Summary

`packages/graph/tests/blast-radius` validates the `CascadeSimulator` class, which models change propagation through a dependency graph. Given a source node, it traverses outbound edges, computes cumulative failure probabilities for reachable nodes, identifies critical fan-out hubs (amplification points), and respects two termination conditions: probability floor and depth cap. Tests cover node resolution, probability compounding along multi-path scenarios, cycle resilience, deduplication, and result ordering.

## Invariants

- Source node must exist in the graph; missing source throws 'Node not found'
- Source node never appears in flatSummary results
- When a node is reachable via multiple paths, only the highest cumulative probability is retained; the node appears exactly once
- flatSummary contains zero duplicate nodeIds regardless of graph topology
- Nodes with cumulative probability below the floor (default 0.05) are pruned and not traversed further
- maxDepth option hard-stops traversal; results never exceed the specified depth
- Amplification points are nodes with fan-out > 3 (more than 3 direct outbound edges)
- Cycles and self-loops do not cause infinite recursion; backward edges and self-references are visited at most once per BFS context
- flatSummary is sorted descending by cumulativeProbability
- Edge type filtering via edgeTypes option silently skips unlisted relation types during traversal
- Custom ProbabilityStrategy can override default edge weights; simulator remains acyclic under strategy injection

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
