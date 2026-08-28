---
schemaVersion: 1
module: 'packages/graph/src/entropy'
sourceHash: '0a92f83581c2094b0e01520ee00a72587a5e7ccbb1ac39fb79ec7efb1eea08a1'
compiledAt: '2026-08-28T01:22:11.594Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'GraphAnomalyAdapter.ts',
    'GraphComplexityAdapter.ts',
    'GraphCouplingAdapter.ts',
    'GraphEntropyAdapter.ts',
  ]
---

## Summary

The `entropy` module provides four adapter classes that detect structural issues in a code dependency graph. GraphEntropyAdapter identifies documentation drift, unreachable code (via BFS from `index.ts` entry points), and graph snapshots. GraphAnomalyAdapter spots statistical outliers and articulation points—files whose removal fragments the dependency graph—using z-score analysis and Tarjan's algorithm. GraphComplexityAdapter computes hotspot scores by combining function cyclomatic complexity with file change frequency. GraphCouplingAdapter analyzes each file's import shape: fan-in, fan-out, coupling ratio, and transitive dependency depth. All adapters compose around a shared GraphStore.

## Invariants

- Entry point identification for dead code detection depends on files named exactly `index.ts` or nodes with `metadata.entryPoint === true`; missing or misnamed index files cause false positives for reachability
- Articulation points use undirected edges: import edges are treated bidirectionally in Tarjan's algorithm; directional logic is load-bearing for correctness
- Z-score outlier detection silently returns empty when standard deviation is 0 (all values equal); callers must not assume all metrics produce outliers
- Metric routing is strict: cyclomatic complexity works only on functions/methods; coupling metrics only on files; requesting a metric on the wrong node type silently yields no data
- Change frequency for complexity hotspots relies on `references` edges to file nodes; if commit nodes don't wire these edges, all change frequencies are 0
- Coupling ratio defaults to 0 when fanIn + fanOut is 0 (isolated files); this is correct but must not be confused with high-quality code
- Transitive depth BFS follows only outbound `imports` edges; cycles are handled by visited set; depth is relative to start node, not normalized across files

## Interface Contract

```ts
export GraphAnomalyAdapter
export GraphComplexityAdapter
export GraphCouplingAdapter
export GraphEntropyAdapter
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { GraphComplexityAdapter, GraphComplexityResult } from './GraphComplexityAdapter.js'
import { GraphCouplingAdapter, GraphCouplingResult } from './GraphCouplingAdapter.js'
```
