---
schemaVersion: 1
module: 'packages/graph/tests/types'
sourceHash: '71d311724af46d56f8a9fbc32ca576ce2338e465d0010e6689b143527f2276b7'
compiledAt: '2026-08-28T01:22:11.785Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'edge-provenance.test.ts',
    'node-stability.test.ts',
    'schema-traceability.test.ts',
    'staleness-schema.test.ts',
  ]
---

## Summary

`packages/graph/tests/types` validates the schema contract for the knowledge graph's node and edge models across four concerns: (1) edge provenance—edges optionally carry a constrained `provenance` field (EXTRACTED, INFERRED, AMBIGUOUS) coexisting with metadata like confidence, with back-compat for provenance-less edges; (2) node stability tiers—NODE_STABILITY partitions seven node types by lifecycle (five session-scoped, two static-scoped); (3) traceability schema—adds requirement nodes and three edge types (requires, verified_by, tested_by) to support requirements linkage, with verified_by supporting confidence scores; (4) node staleness—optional staleness object tracking invalid nodes via constrained reason codes, missing file references, and detection timestamp.

## Invariants

- EDGE_PROVENANCES enumerates exactly ['EXTRACTED', 'INFERRED', 'AMBIGUOUS']
- Provenance is optional on edges; absent provenance is valid (back-compat)
- Unknown provenance values are rejected by schema validation
- Provenance and confidence coexist on the same edge without conflict
- NODE_STABILITY contains exactly 7 entries: 5 types map to 'session', 2 types map to 'static'
- Requirement nodes are schematized with id, type: 'requirement', name, and optional metadata
- Verified_by edges support confidence scores as a mechanism for weak/strong evidence linking
- Staleness is optional on nodes; absent staleness is valid (back-compat)
- Staleness reasons are constrained—unknown reasons are rejected by validation
- Staleness tracks missing references via missingReferences array and detectedAt timestamp

## Interface Contract

```ts

```

## Dependency Slice

```
import { NODE_STABILITY } from '../../src/types'
import { EDGE_PROVENANCES, EDGE_TYPES, GraphEdgeSchema, GraphNodeSchema, NODE_TYPES } from '../../src/types.js'
import { describe, expect, it } from 'vitest'
```
