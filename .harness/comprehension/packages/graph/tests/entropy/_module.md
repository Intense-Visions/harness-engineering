---
schemaVersion: 1
module: 'packages/graph/tests/entropy'
sourceHash: '76ebc001cfd5795e957300b5198116ccb8307a736db9d6412a12b2e2fc75cedf'
compiledAt: '2026-08-28T01:22:11.722Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'GraphAnomalyAdapter.test.ts',
    'GraphComplexityAdapter.test.ts',
    'GraphCouplingAdapter.test.ts',
    'GraphEntropyAdapter.test.ts',
  ]
---

## Summary

The **entropy** test module validates four complementary graph adapters that detect code quality degradation across different dimensions. `GraphAnomalyAdapter` identifies statistical outliers (via Z-score) and structural vulnerabilities (articulation points whose removal disconnects graph components). `GraphComplexityAdapter` flags high-churn, high-complexity files as risky hotspots. `GraphCouplingAdapter` quantifies dependency structure through fan-in/fan-out metrics and transitive depth. `GraphEntropyAdapter` detects three types of entropy: documentation drift (stale doc-code edges based on lastModified timestamps), dead code (unreachable nodes not reachable from entry points like index.ts), and graph composition snapshots by type. All adapters ingest data via `CodeIngestor` and `KnowledgeIngestor`, reading from a `GraphStore`.

## Invariants

- Threshold enforcement: Z-score threshold ≥ 2.0 (zero/negative clamped); unrecognized metrics warn but don't halt.
- Zero-variance skip: Metrics with stdDev=0 produce no outliers (can't compute Z-score).
- Result ordering: Statistical outliers sorted by Z-score descending; articulation points by dependentCount descending.
- Multi-metric flagging: Nodes can appear multiple times across result sets if anomalous on different metrics.
- Imports-only articulation: Only 'imports' edges considered for articulation detection (other edge types ignored).
- Coupling definition: fanOut = outgoing imports; fanIn = incoming imports; couplingRatio = fanOut / (fanOut + fanIn).
- Conservative drift: Missing lastModified timestamps treated as stale; edge fresh only if doc ≥ code timestamp.
- Entry point identification: index.ts files defined as entry points; reachability determined via graph traversal.
- Empty graph safety: All adapters return zero/empty results on empty graphs (no crashes).
- Snapshot consistency: Sum of nodesByType = total nodeCount; sum of edgesByType = total edgeCount.

## Interface Contract

```ts

```

## Dependency Slice

```
import { GraphAnomalyAdapter } from '../../src/entropy/GraphAnomalyAdapter.js'
import { GraphComplexityAdapter } from '../../src/entropy/GraphComplexityAdapter'
import { GraphCouplingAdapter, GraphCouplingFileData, GraphCouplingResult } from '../../src/entropy/GraphCouplingAdapter.js'
import { GraphDeadCodeData, GraphDriftData, GraphEntropyAdapter, GraphSnapshotSummary } from '../../src/entropy/GraphEntropyAdapter.js'
import { CodeIngestor } from '../../src/ingest/CodeIngestor.js'
import { KnowledgeIngestor } from '../../src/ingest/KnowledgeIngestor.js'
import { GraphStore } from '../../src/store/GraphStore'
import { GraphStore } from '../../src/store/GraphStore.js'
import * as path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
```
