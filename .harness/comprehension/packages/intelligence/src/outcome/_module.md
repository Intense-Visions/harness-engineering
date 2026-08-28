---
schemaVersion: 1
module: 'packages/intelligence/src/outcome'
sourceHash: '0117803db7e8f59e09e6bf7e67f1f8e4cf7856ce7d681fc5fc82708edb9f0896'
compiledAt: '2026-08-28T01:22:11.839Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['connector.ts', 'types.ts']
---

## Summary

The `outcome` module ingests execution results into the knowledge graph via `ExecutionOutcomeConnector`. It converts each `ExecutionOutcome` object (representing a worker's execution of an issue) into a single `execution_outcome` graph node containing metadata (result, retry count, failure reasons, duration, linked spec ID, optional agent persona and task type) and defensive `outcome_of` edges to existing affected system nodes. The connector strictly filters caller-supplied metadata by stripping reserved core keys before merge, preventing shadowing and enabling downstream effectiveness analytics to reliably attribute outcomes to agents and trace system impacts.

## Invariants

- Reserved metadata keys (id, identifier, type, name, result, retryCount, failureReasons, durationMs, linkedSpecId, timestamp, issueId, agentPersona, taskType, affectedSystemNodeIds, edges) are always non-overridable—caller-supplied metadata is stripped of all reserved keys before merge, even conditionally-written ones.
- Exactly one execution_outcome node is created per ingest call; outcome_of edges are created only for affectedSystemNodeIds that correspond to existing nodes in the graph.
- Caller metadata is applied only after reserved-key stripping via stripReservedKeys(), ensuring core fields cannot be shadowed.
- Optional fields (agentPersona, taskType) are written to metadata only when defined, preserving the distinction between unset and explicitly null values for analytics consumers.
- The connector assumes valid ExecutionOutcome inputs (type-checked by TypeScript) and performs no runtime structural validation.

## Interface Contract

```ts
export ExecutionOutcomeConnector
```

## Dependency Slice

```
import { ExecutionOutcome } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
```
