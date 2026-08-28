---
schemaVersion: 1
module: 'packages/intelligence/tests/outcome'
sourceHash: 'fe939650257423b677bc6925ddbed498d4d4f589095c9d470d5cee1ced30300a'
compiledAt: '2026-08-28T01:22:11.910Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['connector.test.ts']
---

## Summary

The ExecutionOutcomeConnector module orchestrates ingestion of execution outcomes into a knowledge graph. It accepts ExecutionOutcome records (capturing test/task execution results, failure metadata, duration, and spec linkage) and materializes them as graph nodes with edges to affected system modules. The connector materializes execution_outcome nodes with full metadata preservation, creates directed outcome_of edges to system nodes present in the graph, and enforces strict metadata isolation so caller-supplied metadata cannot shadow reserved fields. The module treats ingestion as idempotent upsert.

## Invariants

- Metadata core fields are immutable from caller (result, id, identifier, durationMs, linkedSpecId, issueId, affectedSystemNodeIds, edges) — sourced solely from ExecutionOutcome, never overrideable by optional metadata field (SUG-1 invariant).
- Conditional metadata fields (agentPersona, taskType) are presence-gated: only written to node metadata if supplied at top level of ExecutionOutcome; omitting them yields undefined, preventing accidental scorer attribution.
- Graph consistency: outcome_of edges created only for system node IDs that already exist in the graph; missing targets silently skipped without errors, preserving partial linkage.
- Extra metadata is pass-through, additive: non-reserved fields in ExecutionOutcome.metadata flow into node metadata unchanged, enabling forward-compatible enrichment without schema changes.
- Ingestion is idempotent: repeated calls with same outcome ID produce upsert semantics (one node, merged state), not duplicate records.

## Interface Contract

```ts

```

## Dependency Slice

```
import { ExecutionOutcomeConnector } from '../../src/outcome/connector.js'
import { ExecutionOutcome } from '../../src/outcome/types.js'
import { GraphStore } from '@harness-engineering/graph'
import { describe, expect, it } from 'vitest'
```
