---
schemaVersion: 1
module: 'packages/graph/src/feedback'
sourceHash: 'be42444b74b6d0f170ee67485fd587492d5ff997ccd59d9857c1d4e548c5dcee'
compiledAt: '2026-08-28T01:22:11.585Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['GraphFeedbackAdapter.ts']
---

## Summary

GraphFeedbackAdapter is an impact-analysis layer that queries a GraphStore to answer two questions: (1) what tests and docs are affected by code changes? and (2) what's the overall health of our knowledge graph? Impact computation traverses inbound edges from changed files to find tests that import them (via regex `/test/i` on paths) and docs that document them (via a `documents` edge type). Health metrics scan all file nodes to count undocumented files (zero incoming `documents` edges), unreachable files (zero inbound imports AND not an entry point), and constraint violations. Used by harness components that need to decide which test suites to run or which docs to refresh when code changes, and to monitor graph quality over time.

## Invariants

- Impact scope = inbound imports only. The impactScope metric counts only 'imports' edges, not 'documents' or other relationships. Changing this changes what 'impact' means downstream.
- Test detection by regex. A file is a test if its path matches /test/i. This catches test/, tests/, .test.ts, but misses spec/, e2e/, or other naming conventions. Entry points to test-selection logic depend on this heuristic being stable.
- Entry points never unreachable. Files named index.ts (or with metadata.entryPoint=true) are exempt from unreachable-node detection even if nothing imports them. This preserves index files as always-reachable anchors.
- Documentation is binary. A file is 'documented' if it has at least one incoming 'documents' edge. No notion of adequacy, scope, or currency—just presence/absence.
- Bidirectional edge queries. The adapter assumes store.getEdges({ to: X, type: T }) returns all edges of type T pointing to X. The store's indexing strategy must support this efficiently (O(1) or O(log n)), not O(n).

## Interface Contract

```ts
export GraphFeedbackAdapter
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
```
