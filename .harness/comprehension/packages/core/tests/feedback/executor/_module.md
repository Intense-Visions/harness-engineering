---
schemaVersion: 1
module: 'packages/core/tests/feedback/executor'
sourceHash: '8c74b97aeda087f18388f5a1993152f9a81eff21123d7d8be3a1fd0123d71fcb'
compiledAt: '2026-08-28T01:22:10.845Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['noop.test.ts']
---

## Summary

NoOpExecutor is a stub executor for the feedback agent system that simulates async agent execution synchronously. It spawns processes with unique IDs that immediately complete, tracks them in an in-memory registry, and supports querying, waiting, and terminating processes. Always returns approved reviews and proper errors for unknown IDs.

## Invariants

- Each spawn() call generates a globally unique process ID, even for identical configs
- Spawned processes immediately have status 'completed' (no async delay)
- A process remains queryable via status() until kill() removes it from the registry
- status() and wait() return error (AGENT_SPAWN_ERROR) for unknown IDs; kill() is idempotent
- wait() always returns approved: true and echoes back the AgentConfig.type as agentType
- All async methods return a Result<T> monad with ok: boolean; callers must check .ok before accessing .value

## Interface Contract

```ts

```

## Dependency Slice

```
import { NoOpExecutor } from '../../../src/feedback/executor/noop'
import { AgentConfig } from '../../../src/feedback/types'
import { describe, expect, it } from 'vitest'
```
