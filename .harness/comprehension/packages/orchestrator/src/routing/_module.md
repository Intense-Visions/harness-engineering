---
schemaVersion: 1
module: "packages/orchestrator/src/routing"
sourceHash: "fdfc94492d2c27f806ef53bfe7eb7192c97d449dcdec14ef6e5db97d8f34e503"
compiledAt: "2026-08-28T01:22:12.323Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["decision-bus.ts", "index.ts"]
---

## Summary

RoutingDecisionBus is an in-process event bus that captures routing decisions in a bounded ring buffer (capacity default 500). Subscribers receive decisions synchronously; errors are isolated. The bus supports filtering by skill, mode, or backend, returns results newest-first, and emits structured logs if a logger is provided.

## Invariants

- Subscriber exceptions must be caught and logged, never propagated to the emitter (S6)
- Ring buffer is capacity-bounded via Array.shift() when full; oldest entries are removed first
- Filtering (skillName/mode/backendName) precedes limiting, so limit bounds the filtered set not the raw buffer
- recent() returns results in reverse insertion order (newest first)
- One structured log line per emit() when logger is present (O1: useCase, backendName, resolutionPathLength, durationMs)
- clearListeners() must be called during teardown to release subscriber references before bus is dereferenced

## Interface Contract

```ts
export RoutingDecisionBus
export RoutingDecisionBusFilter
export RoutingDecisionBusOptions
```

## Dependency Slice

```
import { StructuredLogger } from '../logging/logger.js'
import { RoutingDecision } from '@harness-engineering/types'
```
