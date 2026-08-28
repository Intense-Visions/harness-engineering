---
schemaVersion: 1
module: 'packages/graph/benchmarks'
sourceHash: '73a5f5d1739d4d057c5c55f4651b81003c8f1220b558c882c467468dbbd94d5b'
compiledAt: '2026-08-28T01:22:11.567Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['queries.bench.ts']
---

## Summary

This is a Vitest microbenchmark suite for the graph query layer. It measures performance of three core operations: GraphStore node/edge operations, ContextQL graph traversal, and groupNodesByImpact categorization. The suite uses a shared fixture that builds a ~100-node synthetic graph (10 modules with 5 files each, cross-module edges, test results, and ADR documents), then runs isolated benchmarks against it. addNode has its own ephemeral store to avoid polluting the shared state; the other two operations depend on consistent fixture state.

## Invariants

- Shared graph isolation: sharedGraph is built once at module scope and reused across ContextQL and groupNodesByImpact benches—this state is read-only. Any mutation-based bench must use a dedicated store (see addNode pattern).
- Fixture determinism: buildMediumGraph creates exactly 10 modules × 5 files × 1 function + edges + 10 test_result nodes + 5 adr nodes. Node/edge counts are implicit in test assumptions—don't change structure without auditing dependent benchmarks.
- GraphStore contract: Must support addNode (identity-keyed), findNodes (shallow filter by properties), and addEdge (typed, no deduplication enforced). Bench assumes O(1) or O(n) lookups.
- ContextQL traversal: Expects rootNodeIds→maxDepth bounded search. Bench uses depth=2 from module root—a small but representative query size.
- groupNodesByImpact scope: Function signature is (allNodes, scopeNodeId) where allNodes is the full node set; bench passes module root as scope. Impact categorization is deterministic given node types and edges.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ContextQL } from '../src/query/ContextQL.js'
import { groupNodesByImpact } from '../src/query/groupImpact.js'
import { GraphStore } from '../src/store/GraphStore.js'
import { GraphEdge, GraphNode } from '../src/types.js'
import { bench, describe } from 'vitest'
```
