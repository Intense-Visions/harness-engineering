---
schemaVersion: 1
module: 'packages/dashboard/tests/client/components/orchestrator'
sourceHash: 'a18b4a5cd2bff1847159a07d589e0271f47c138a8c5f0f1e33372e7423f8e7de'
compiledAt: '2026-08-28T01:22:11.419Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['navigation.test.tsx']
---

## Summary

The `packages/dashboard/tests/client/components/orchestrator/navigation` module tests the `findAgentThreadId()` function, which retrieves an agent thread from the thread store by matching on issue ID. The function must distinguish agent threads (type='agent') from other thread types like attention threads that may also carry the same issueId field. Tests use a `seedAgentThread` helper that leverages the real store's thread-creation logic to ensure the derived ID format (`agent:<issueId>`) matches production. The suite validates correct lookups, undefined returns on misses or empty stores, multi-thread disambiguation, and type-based filtering.

## Invariants

- Thread type gates the match: findAgentThreadId returns results only for threads of type 'agent', not other thread types ('attention', etc.) that may carry the same issueId metadata field.
- ID derivation must be production-faithful: The helper uses the store's real createThread method, not mock IDs, so derived IDs (agent:<issueId>) stay in sync with how production generates them.
- Store isolation per test: Each test resets the thread store to empty state (threads: new Map(), activeThreadId: null, lastThreadId: null) so thread state doesn't leak between cases.
- Undefined on miss, not throw: The function gracefully returns undefined when no thread matches or the store is empty, rather than throwing or defaulting to wrong data.
- issueId is the lookup key: The function resolves threads by scanning the store for agent threads whose metadata's issueId field matches the query.

## Interface Contract

```ts

```

## Dependency Slice

```
import { findAgentThreadId } from '../../../../src/client/components/orchestrator/navigation'
import { useThreadStore } from '../../../../src/client/stores/threadStore'
import { AgentMeta } from '../../../../src/client/types/thread'
import { beforeEach, describe, expect, it } from 'vitest'
```
