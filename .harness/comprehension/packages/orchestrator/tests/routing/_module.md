---
schemaVersion: 1
module: "packages/orchestrator/tests/routing"
sourceHash: "d5bae545162655d05f7042e7f048992d7d2ae304dee9879b5a9d2acf640ef94c"
compiledAt: "2026-08-28T01:22:12.633Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["decision-bus.test.ts"]
---

## Summary

The `packages/orchestrator/tests/routing` module tests the **RoutingDecisionBus**, a pub-sub log for backend routing decisions. The bus maintains a ring buffer of routing selections (which backend handled a request, via which path, in how long), emits structured logs for observability, and allows subscribers to react to decisions in real time. Key behaviors: capacity-bounded history with newest-first ordering, error isolation (one broken subscriber doesn't break others), structured logging on every emit, and time-based filtering + query filters on retrieval.

## Invariants

- Ring buffer capacity is hard-enforced — recent() never returns more than capacity decisions, even after 10,000+ emits; oldest decisions discard in FIFO order
- Recent decisions always order newest-first — most recent at index 0, older ones follow in descending time order
- Subscriber errors are isolated — one throwing subscriber doesn't prevent subsequent subscribers from receiving the same emit; error is caught, logged, execution continues
- Each emit produces exactly one structured log line — every bus.emit() calls logger.info('routing-decision', {...}) with decision details (backend name, duration, resolution path length, use case)
- Query filters are independent — recent({ skillName, mode, backendName, limit }) applies all filters additively; limit: 5 returns at most 5 decisions
- Subscribers can be revoked individually or collectively — subscribe() returns an unsubscribe function; clearListeners() removes all at once; post-revocation emits don't reach cleared listeners

## Interface Contract

```ts

```

## Dependency Slice

```
import { StructuredLogger } from '../../src/logging/logger.js'
import { RoutingDecisionBus } from '../../src/routing/decision-bus.js'
import { RoutingDecision } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
