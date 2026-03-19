# Graph-Driven Context Assembly

## Overview

Static context approaches (manually listing files, hard-coding include paths) break down as
codebases grow. Graph-driven context assembly replaces that pattern with an
intent-based pipeline: you describe **what you need**, the graph resolves
**which nodes matter**, and a token budget controls **how much is returned**.

The pipeline has three layers:

1. **FusionLayer** -- hybrid keyword + semantic search that scores every graph node.
2. **ContextQL** -- BFS graph traversal that expands each hit to its neighbours.
3. **Assembler** -- orchestrates fusion, expansion, budget enforcement, and phase filtering.

Together they guarantee that the context window contains the most relevant
information for the current task, without manual curation.

## Assembler Class

`Assembler` is the main entry point. It requires a `GraphStore` and accepts an
optional `VectorStore` for semantic search.

```ts
import { Assembler } from '@harness/graph';

const assembler = new Assembler(graphStore, vectorStore);
```

### assembleContext(intent, tokenBudget?)

Finds and ranks nodes relevant to a natural-language intent, expands each hit
two hops via ContextQL, then truncates to fit the token budget (default 4 000).

```ts
const ctx = assembler.assembleContext('authentication middleware', 6000);
// ctx.nodes      -- ranked GraphNode[]
// ctx.edges      -- edges between kept nodes
// ctx.tokenEstimate
// ctx.truncated  -- true when nodes were dropped to fit the budget
```

Nodes are sorted by fusion score; expanded neighbours receive half the score of
their root. When the budget is exceeded, the lowest-scoring nodes are removed
first and only edges between kept nodes survive.

### computeBudget(totalTokens, phase?)

Returns a `GraphBudget` that allocates tokens proportionally across node types,
boosted by an optional phase. Module density (edge count) is also reported so
callers can identify high-connectivity areas.

```ts
const budget = assembler.computeBudget(8000, 'review');
// budget.allocations -- e.g. { adr: 2400, document: 2400, ... }
// budget.density     -- e.g. { core: 14, auth: 7 }
```

### filterForPhase(phase)

Returns nodes and file paths relevant to a development phase. Recognised phases
and the node types they surface:

| Phase       | Node types                                         |
| ----------- | -------------------------------------------------- |
| `implement` | file, function, class, method, interface, variable |
| `review`    | adr, document, learning, commit                    |
| `debug`     | failure, learning, function, method                |
| `plan`      | adr, document, module, layer                       |

### generateMap()

Produces a markdown repository map ordered by module connectivity, including
symbol counts per file and the top-5 entry-point files by outbound edge count.

### checkCoverage()

Audits documentation coverage across all code nodes (file, function, class,
interface, method, variable). Returns documented IDs, undocumented IDs, total
count, and a coverage percentage.

## MCP Tools

Three MCP tools expose assembly capabilities without writing TypeScript.

### find_context_for

Highest-level tool. Pass an intent string and optional token budget:

```
find_context_for intent="error handling in the payments module" budget=5000
```

Returns assembled nodes, edges, and a truncation flag.

### query_graph

Runs a ContextQL traversal from explicit root node IDs:

```
query_graph rootNodeIds=["payments/charge.ts"] maxDepth=3 bidirectional=true
```

Useful when you already know the starting point and want to explore neighbours
without the fusion ranking step.

### search_similar

Performs a FusionLayer search and returns scored results with keyword and
semantic signal breakdowns:

```
search_similar query="rate limiting" limit=10
```

Each result includes `score`, `signals.keyword`, and `signals.semantic` so you
can inspect why a node ranked where it did.

## Intent-Driven Assembly

The quality of assembled context depends on the intent string. Be specific:

| Workflow       | Example intent                                            |
| -------------- | --------------------------------------------------------- |
| Code review    | `"conventions and ADRs related to the auth module"`       |
| Planning       | `"module boundaries and layer dependencies for payments"` |
| Debugging      | `"past failures and learnings around token refresh"`      |
| Implementation | `"function signatures and interfaces in src/billing"`     |

Vague intents like `"everything"` will scatter the budget across unrelated nodes.

## Token Budget

`assembleContext` enforces a hard token ceiling. Tokens are estimated at roughly
4 characters per token, counting name, path, type, and serialised metadata for
each node.

Budget-aware strategies:

- **Small tasks (2 000--4 000 tokens)** -- tight focus; only top fusion hits survive.
- **Broad reviews (8 000--12 000 tokens)** -- room for ADRs, learnings, and commit history.
- **Full planning (16 000+ tokens)** -- module maps plus architectural documents.

Use `computeBudget` with a phase to let the graph decide allocation weights.
High-density modules (many edges) signal areas that may need proportionally more
budget.

## Examples

### Code Review Context

```ts
const ctx = assembler.assembleContext(
  'conventions and prior decisions for the billing module',
  8000
);
// Surfaces ADRs, documents, learnings, and recent commits related to billing.
```

### Planning Context

```ts
const budget = assembler.computeBudget(12000, 'plan');
const map = assembler.generateMap();
const ctx = assembler.assembleContext('module dependencies for API gateway', 12000);
// Combines the repo map with architectural nodes for informed planning.
```

### Debugging Context

```ts
const phaseNodes = assembler.filterForPhase('debug');
const ctx = assembler.assembleContext('token refresh failures', 4000);
const coverage = assembler.checkCoverage();
// phaseNodes surfaces failure and learning nodes.
// ctx focuses on token-refresh-related hits.
// coverage highlights undocumented code that may hide the bug.
```
