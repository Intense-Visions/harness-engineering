---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/orchestrator'
sourceHash: 'ab25025e0ec63e5f94611a3c42c61800d6c006d264c0a3c4bd22224430b0d608'
compiledAt: '2026-08-28T01:22:11.263Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['navigation.ts']
---

## Summary

The `orchestrator` module provides thread navigation utilities for the agent-driven orchestration UI. `findAgentThreadId` is a shared lookup helper that locates an existing agent thread by issue ID by scanning the thread store's agent-typed threads and comparing their issueId metadata. It's used to prevent duplicate agent dispatch and route navigation callbacks to the correct thread.

## Invariants

- Type assumption: When thread.type === 'agent', thread.meta is assumed to be AgentMeta without explicit type guard — relies on store construction enforcing this invariant
- Store availability: useThreadStore.getState() must be synchronous and callable outside React render (used in navigation callbacks, not a hook)
- Lookup structure: Thread collection must support .values() iteration; no indexed lookup by issueId, so O(n) scan across all threads per call
- Return value: Consistently returns undefined (not null) for no match; callers must handle falsy checks
- Matching semantics: Uses exact string equality on issueId; no normalization or partial matching
- Thread ID presence: Returned thread.id for agent threads must always be truthy (invariant of store construction)

## Interface Contract

```ts
export findAgentThreadId
```

## Dependency Slice

```
import { useThreadStore } from '../../stores/threadStore'
import { AgentMeta } from '../../types/thread'
```
