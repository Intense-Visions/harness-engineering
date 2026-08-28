---
schemaVersion: 1
module: 'packages/graph/tests/context'
sourceHash: 'a3d9eda77c6109c3d4b1005e361a9633ca4cd95ec863c8c7818c873a7829674c'
compiledAt: '2026-08-28T01:22:11.701Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['Assembler.test.ts']
---

## Summary

`packages/graph/tests/context` validates the **Assembler** class, which constructs context windows for LLM interaction by ranking and selecting relevant graph nodes under token constraints. The test suite covers intent-based retrieval (matching semantic queries to code/knowledge nodes), token budget enforcement (hard caps with truncation signals), phase-aware filtering (implement prioritizes code, review prioritizes docs), coverage reporting (tracks documented vs. undocumented code entities), and budget allocation (distributes tokens across node types with phase-specific boosts). The module bridges graph ingestion (CodeIngestor, KnowledgeIngestor) with LLM consumption, solving: "which N nodes should I include in a context window to answer this question without overflowing?"

## Invariants

- Token budget is hard-capped: tokenEstimate ≤ budget, or truncated=true signals overflow
- Budget allocation is exhaustive: Σ(allocations[nodeType]) = totalTokens (no token leakage)
- Phase filters are mutually exclusive: filterForPhase('implement') returns only code types; 'review' returns only doc/ADR types—no overlap
- Coverage sum is exact: documented.length + undocumented.length === totalCodeNodes (audits classification consistency)
- Phase boosting is monotonic: code types receive strictly more budget in 'implement' phase than without phase; doc types in 'review' phase
- Intent matches are non-empty: assembleContext(intent).nodes.length > 0 (intent always finds at least one match)
- Smaller budgets yield fewer nodes: assembleContext(intent, 50).nodes.length ≤ assembleContext(intent, 10000).nodes.length (budget scales result cardinality)

## Interface Contract

```ts

```

## Dependency Slice

```
import { AssembledContext, Assembler, GraphBudget, GraphCoverageReport, GraphFilterResult } from '../../src/context/Assembler.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
```
