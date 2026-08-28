---
schemaVersion: 1
module: 'packages/graph/src/blast-radius'
sourceHash: '1c056239d81aab37eda502a38d07c9ebf73dbf105a5170bca4fb02f76d0e5855'
compiledAt: '2026-08-28T01:22:11.584Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['CascadeSimulator.ts', 'CompositeProbabilityStrategy.ts', 'index.ts', 'types.ts']
---

## Summary

**Blast Radius** is an impact-propagation simulator that models failure cascades through a dependency graph. Given a source node, `CascadeSimulator` performs breadth-first traversal to compute the cumulative probability of impact across all reachable nodes. It supports pluggable probability strategies (default: `CompositeProbabilityStrategy` blends edge-type weights + change frequency + coupling metrics), respects depth/probability bounds to prevent exponential blowup, and categorizes results by depth layer and risk tier (high ≥ 0.5, medium ≥ 0.2). The output flags amplification points (nodes with fan-out > 3) and reports truncation if graph complexity exhausts safety caps.

## Invariants

- Probability accumulation is multiplicative — cumulative probability decreases monotonically with depth as probabilities multiply along paths. This bounds traversal automatically.
- Probability floor gates all enqueuing — any edge below `probabilityFloor` (default 0.05) is never added to the queue. Without this, degenerate graphs traverse infinitely.
- Max depth + probability floor work together — depth caps at `maxDepth` (default 10); only paths both below this depth AND above the probability floor are explored.
- Hard queue-size safety cap stops OOM — if queue exceeds 10,000 entries, traversal halts and sets `truncated: true`. Degenerate graphs (fully connected, dense cycles) will hit this before depth or probability bounds.
- Visited map uses probability-based deduplication — a node is re-enqueued only if a higher cumulative-probability path is found. Cycles are broken implicitly because probabilities decrease monotonically.
- Source node is excluded from cascades — both seed and expansion skip `edge.to === sourceNodeId`, preventing loops back to origin.
- Edge-type filter is applied consistently — if provided, only edges in the filter set are traversed in seedQueue and expandNode; skipped edges do not affect fan-out counts.
- Probability strategy output is clamped to [0, 1] — `CompositeProbabilityStrategy` uses `Math.min(1, ...)` to ensure no overflow from the blended formula.
- Category breakdown silently drops unclassifiable nodes — `classifyNodeCategory()` lookup failures do not error; affected nodes just don't increment any category bucket.
- Risk tiers are absolute probability thresholds, not depth-relative — all nodes with cumProb ≥ 0.5 are 'highRisk' regardless of depth; deeper cascades do not auto-downgrade.

## Interface Contract

```ts
export CascadeLayer
export CascadeNode
export CascadeResult
export CascadeSimulationOptions
export CascadeSimulator
export CompositeProbabilityStrategy
export ProbabilityStrategy
```

## Dependency Slice

```
import { classifyNodeCategory } from '../query/groupImpact.js'
import { GraphStore } from '../store/GraphStore.js'
import { GraphEdge, GraphNode } from '../types.js'
import { CompositeProbabilityStrategy } from './CompositeProbabilityStrategy.js'
import { CascadeLayer, CascadeNode, CascadeResult, CascadeSimulationOptions, ProbabilityStrategy } from './types.js'
```
